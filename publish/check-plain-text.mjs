// check-plain-text.mjs — 발행 텍스트에 마크다운 기호가 섞였나. 2026-10-04 신설(사용자 지시).
//
// 왜 만들었나:
//   스레드·인스타 캡션은 **평문**이다. `**굵게**` 를 넣으면 굵어지지 않고 별표 넷이 그대로 나간다.
//   🔬 2026-10-04 API 로 실물을 다시 읽었다 — 본계정 본문 3 · 답글 4 · 2계정 본문 3 이
//      `**` 를 단 채 나가 있었다(9/29 07:00 이 첫 회차 · 10/04 19:00 은 사용자가 앱에서 고쳤다).
//      그 전 본문 약 300편에는 0건이다.
//   ★ 원고는 볼트 세션이 썼다(9/21 `8f2f11f`·`407317e` · 9/28 `0ef5c1d`). 볼트 문서는 강조를
//     전부 `**` 로 하는데, 그 버릇이 **발행 칸까지 따라 들어갔다.**
//   ★★ 발행 직전 게이트 여덟 개 중 **형식을 보는 게 없었다** — 그래서 여덟 개를 다 통과하고 나갔다.
//      `no-ai-tell` 은 「카드뉴스 슬라이드의 볼드는 의도된 장치」라고 적어두는데, 그건
//      **HTML 로 렌더하는 슬라이드** 얘기다. 스레드 칸에는 렌더러가 없다.
//
// ── 판정 ───────────────────────────────────────────────────────────
//   ⛔ 차단 — 평문 칸에 아래 기호가 있으면 막는다. 전부 **그대로 글자로 보이는** 것들이다:
//      `**` 굵게 · `~~` 취소선 · `[[` 위키링크 · 백틱 코드 · `](` 마크다운 링크 · 줄머리 `# ` 제목
//   ⚠️ 해시태그(`#태그`)는 안 문다 — 줄머리 `#` 뒤에 **공백**이 있을 때만 제목으로 본다.
//   ⚠️ `- ` 글머리는 안 문다 — 평문에서도 목록으로 읽힌다.
//
// ── 보는 칸 ────────────────────────────────────────────────────────
//   caption · threadsText · threadsTextOnly(문자열일 때) · threadsReplies · alts · blogUrl.text
//   ⛔ `_` 로 시작하는 메모 칸과 이모지 머리 메모 칸은 안 본다 — 그건 볼트 기록이라 `**` 가 정상이다.
//   ⛔ 캐러셀 슬라이드(cardnews/*.json)는 안 본다 — HTML 렌더라 굵게가 실제로 굵어진다.
//
// 사용:
//   node check-plain-text.mjs --only post-xxx.json   # 발행 경로 (publish.mjs 가 부른다)
//   node check-plain-text.mjs --upcoming             # 오늘 이후 회차 전부 (check-ready 가 매일 부른다)
//   node check-plain-text.mjs --all                  # 코퍼스 전수 — 지나간 회차 포함
//
// 종료 코드: 0 깨끗 · 1 사용법·파일 없음 · 2 기호 발견

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const oi = process.argv.indexOf('--only');
const ONLY = oi >= 0 && process.argv[oi + 1] ? path.basename(process.argv[oi + 1]) : null;
const UPCOMING = process.argv.includes('--upcoming');
const ALL = process.argv.includes('--all');

if (!ONLY && !UPCOMING && !ALL) {
  console.error('사용법: node check-plain-text.mjs --only <매니페스트.json>  |  --upcoming  |  --all');
  process.exit(1);
}

const MARKS = [
  ['굵게 **', /\*\*/],
  ['취소선 ~~', /~~/],
  ['위키링크 [[', /\[\[/],
  ['코드 백틱', /`/],
  ['마크다운 링크 ](', /\]\(/],
  ['제목 # ', /^#{1,6}\s/m],
];

// 한국 시간 기준 오늘 — 발행 시각이 KST 라 UTC 날짜를 쓰면 09:00 전에 하루가 어긋난다.
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const rows = [];
let seen = 0;
for (const f of readdirSync(HERE).filter((x) => /^post-.*\.json$/.test(x) && (!ONLY || x === ONLY)).sort()) {
  let j;
  try { j = JSON.parse(readFileSync(path.join(HERE, f), 'utf8')); } catch { continue; }
  if (UPCOMING && !ONLY && !(typeof j.publishDate === 'string' && j.publishDate >= TODAY)) continue;
  seen += 1;
  const push = (field, v) => { if (typeof v === 'string' && v.trim()) rows.push({ file: f, date: j.publishDate ?? '', field, text: v }); };
  push('caption', j.caption);
  push('threadsText', j.threadsText);
  push('threadsTextOnly', j.threadsTextOnly);
  (Array.isArray(j.threadsReplies) ? j.threadsReplies : []).forEach((v, i) => push(`threadsReplies[${i}]`, v));
  (Array.isArray(j.alts) ? j.alts : []).forEach((v, i) => push(`alts[${i}]`, v));
  if (j.blogUrl && typeof j.blogUrl === 'object') push('blogUrl.text', j.blogUrl.text);
}

// ⛔ `--only` 인데 파일을 못 찾았으면 조용히 통과하지 않는다 — 오타와 「문제 없음」이 같아 보인다.
if (ONLY && !seen) {
  console.error(`⛔ --only ${ONLY} — 그 매니페스트를 못 찾았다. 경로: ${HERE}`);
  process.exit(1);
}

const hits = [];
for (const r of rows) {
  for (const [name, re] of MARKS) {
    const lines = r.text.split('\n').filter((l) => re.test(l));
    if (lines.length) hits.push({ ...r, name, sample: lines[0].trim().slice(0, 60) });
  }
}

const scope = ONLY ? ONLY : UPCOMING ? `오늘(${TODAY}) 이후 ${seen}편` : `전체 ${seen}편`;
if (!hits.length) {
  console.log(`✅ 평문 칸에 마크다운 기호 없음 — ${scope} · 칸 ${rows.length}개`);
  process.exit(0);
}
console.log(`⛔ 평문 칸에 마크다운 기호 — ${scope} 중 ${new Set(hits.map((h) => h.file)).size}편 ${hits.length}곳`);
console.log('   스레드·인스타는 마크다운을 렌더하지 않는다. 기호가 글자 그대로 나간다.');
for (const h of hits) console.log(`   ${h.date}  ${h.file}  ${h.field}  [${h.name}]  ${h.sample}`);
console.log('▶ 기호만 지운다(문장은 그대로). 강조가 필요하면 줄을 바꾸거나 문장 순서로 한다.');
process.exit(2);
