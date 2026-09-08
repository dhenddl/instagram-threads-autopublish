// check-numbers.mjs — 발행 원고에 **미검증으로 표시된 숫자**가 들어갔는지 검사한다.
// 2026-08-24 신설. 규약은 `pipeline/vault/claim-markers.mjs` 가 단일 출처다.
//
// 왜 이제서야 가능한가:
//   같은 검사를 2026-08-24 오전에 만들었다가 **잘라냈다** — 오탐이 압도적이었고,
//   근본 원인은 정확도가 아니라 추론이었다. 볼트 마커가 **주장**에 붙어 있어서
//   "마커 근처의 숫자 = 미검증 숫자"가 성립하지 않았다.
//   같은 날 사용자가 **마커 규약 변경**을 지시해 ② 표기(`-72%[미검증]`, 숫자 바로 뒤·공백 없음)가
//   「이 숫자가 미검증」을 뜻하게 됐다. **그래서 이 게이트가 정직해졌다.**
//
// ⛔ exit 1 조건 — 아래 둘을 **동시에** 만족할 때만.
//   ① 볼트에서 ② 표기로 **인용 금지 등급**(미검증·미측정·미확인·확인 필요·미확정)이 붙은 숫자
//   ② 그 숫자가 **변별력 있다**(유효숫자 3자리+ · 소수 · 범위)
//   변별력 없는 값(`10개`·`100`)은 **경고만** 하고 통과시킨다 — 오탐을 내는 게이트는 무시되고,
//   무시되는 게이트는 없는 것보다 나쁘다(「신호를 믿으면 안 되는 자리」 처방 4단계 ⑤).
//
// 사용: node pipeline/publish/check-numbers.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKED_NUMBER, BLOCKING, normNumber, isDistinctive } from '../vault/claim-markers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
// ★ 볼트 경로를 바꿔 낄 수 있다 (2026-08-26). vault/lint-*.mjs 와 같은 규칙이다.
//   종전에는 폴더 이름이 박혀 있어서 **볼트 이름이 다르면 못 돌았다.**
//   ⛔ 이건 기록된 차단 목록에 없었다 — 「내보내면 안 되는 것」만 세고
//     「받아서 돌아가는가」는 안 셌기 때문이다. 오늘 3호·4호에서도 같은 모양이 나왔다.
// ★ `--only <매니페스트파일명>` — **그 한 회차만** 검사한다 (2026-08-28 신설).
//   왜 필요한가: `publish.mjs` 가 발행 직전에 이 게이트를 부르게 됐는데,
//   전량 검사면 **다른 회차 원고의 문제로 오늘 발행이 막힌다.**
//   ⛔ 그건 19:00 스레드가 남의 사정으로 안 나가는 것이고, 게이트가 아니라 사고다.
//   ▶ 발행 경로에서는 **자기 회차만** 본다. 전량 검사는 사람이 손으로 돌릴 때 그대로 남는다.
const oi = process.argv.indexOf('--only');
const ONLY = oi >= 0 && process.argv[oi + 1] ? path.basename(process.argv[oi + 1]) : null;

const vi = process.argv.indexOf('--vault');
const VAULT = vi >= 0 && process.argv[vi + 1]
  ? path.resolve(process.cwd(), process.argv[vi + 1])
  : path.join(ROOT, 'second-brain');
const WIKI = path.join(VAULT, 'wiki');

// ⛔ 없는 경로에 조용히 빈 리포트를 내지 않는다 — 경로 오타와 「문제 없음」이 구분이 안 된다.
if (!existsSync(WIKI)) {
  console.error(`⛔ wiki 폴더가 없다: ${WIKI}`);
  console.error(`   --vault <볼트경로> 로 지정한다. 볼트 안에 wiki/ 가 있어야 한다.`);
  process.exit(1);
}
const CARDNEWS = path.join(ROOT, 'pipeline', 'cardnews');

// 규약을 **설명하는** 문서는 제외한다 — 예시로 적은 `<실측 도달값>[미검증]` 이 실제 표시로 잡힌다.
const SKIP = new Set(['log.md', 'index.md', 'lint-report.md', '쓰면 안 되는 숫자.md']);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.md') && !SKIP.has(e)) out.push(p);
  }
  return out;
}

// ── 볼트에서 ② 표기 수집 ──
const marked = new Map();   // 정규화 숫자 -> {raw, marker, page, distinctive}
for (const f of walk(WIKI)) {
  const page = path.basename(f, '.md');
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(MARKED_NUMBER)) {
    const raw = m[1].trim(), marker = m[2];
    const key = normNumber(raw);
    if (!marked.has(key)) {
      marked.set(key, { raw, marker, page, distinctive: isDistinctive(raw), blocking: BLOCKING.has(marker) });
    }
  }
}

// ── 발행 원고 수집 ──
const copy = [];
const push = (file, surface, v) => {
  const t = Array.isArray(v) ? v.join('\n') : (typeof v === 'string' ? v : '');
  if (t.trim()) copy.push({ file, surface, text: t });
};
for (const f of readdirSync(HERE).filter((x) => /^post-.*\.json$/.test(x) && (!ONLY || x === ONLY))) {
  try {
    const j = JSON.parse(readFileSync(path.join(HERE, f), 'utf8'));
    push(f, '릴스 캡션', j.caption);
    push(f, '스레드 본문', j.threadsText ?? j.threadsTextOnly);
    push(f, '스레드 답글', j.threadsReplies);
  } catch { /* skip */ }
}
// ⛔ `--only` 인데 그 파일을 못 찾았으면 **조용히 0건 검사하고 통과하지 않는다.**
//    파일명 오타와 「문제 없음」이 구분이 안 되는 게 이 볼트가 제일 여러 번 당한 모양이다.
if (ONLY && !copy.length) {
  console.error(`⛔ --only ${ONLY} — 그 매니페스트를 못 찾았거나 검사할 원고 칸이 비어 있다.`);
  console.error(`   경로: ${HERE}`);
  process.exit(1);
}
const skipCard = new Set(['slides.json', 'package.json', 'package-lock.json', 'reels-recipes.json', 'deck-roles.json']);
// ★ `--only` 면 **짝이 맞는 슬라이드 하나만** 본다 (`week3-recap.json` ↔ `post-week3-recap.json`).
//   캐러셀 회차는 슬라이드 글자도 같이 발행되므로 빼면 안 된다.
if (existsSync(CARDNEWS) && !(ONLY && !ONLY.startsWith('post-'))) {
  for (const f of readdirSync(CARDNEWS).filter((x) => x.endsWith('.json') && !skipCard.has(x)
      && (!ONLY || `post-${x}` === ONLY))) {
    try {
      const j = JSON.parse(readFileSync(path.join(CARDNEWS, f), 'utf8'));
      const bits = [];
      for (const s of (j.slides || [])) {
        for (const v of Object.values(s)) {
          if (typeof v === 'string') bits.push(v);
          else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') bits.push(x);
        }
      }
      if (bits.length) push(f, '캐러셀 카드', bits.join('\n'));
    } catch { /* skip */ }
  }
}

// ── 대조 ──
// 원고에서 숫자를 뽑는 정규식은 볼트 쪽과 같은 모양이어야 한다.
const COPY_NUM = /-?\d[\d,]*(?:\.\d+)?(?:\s?~\s?-?\d[\d,]*(?:\.\d+)?)?\s?(?:%|만|억|원|배|명|건|편|일|개|장|회|시간|분|초|달|주|년|자)?/g;
const hard = [], soft = [];
for (const d of copy) {
  const seen = new Set();
  for (const m of d.text.matchAll(COPY_NUM)) {
    const raw = m[0].trim();
    if (!raw || !/\d/.test(raw)) continue;
    const key = normNumber(raw);
    if (seen.has(key)) continue;
    const hit = marked.get(key);
    if (!hit || !hit.blocking) continue;
    seen.add(key);
    (hit.distinctive ? hard : soft).push({ ...d, raw, hit });
  }
}

// ── 출력 ──
const blockingCount = [...marked.values()].filter((x) => x.blocking).length;
const distinctCount = [...marked.values()].filter((x) => x.blocking && x.distinctive).length;
console.log(`미검증 표시 숫자(② 표기) ${marked.size}건 — 인용 금지 등급 ${blockingCount} · 그중 변별력 있음 ${distinctCount}`);
console.log(`발행 원고 ${copy.length}건 검사\n`);

if (soft.length) {
  console.log(`⚠️ 경고 ${soft.length}건 — 변별력이 낮아 게이트를 걸지 않는다(우연 일치 가능)`);
  for (const s of soft.slice(0, 8)) {
    console.log(`   ${s.raw}  ${s.surface} (${s.file})  ← [${s.hit.marker}] ${s.hit.page}`);
  }
  console.log('');
}

if (hard.length) {
  console.log(`⛔ 미검증 숫자가 발행 원고에 있다 — ${hard.length}건`);
  for (const h of hard) {
    console.log(`   ${h.raw}  ${h.surface} (${h.file})`);
    console.log(`      └ 볼트 표시: ${h.hit.raw}[${h.hit.marker}] — ${h.hit.page}`);
  }
  console.log('');
  console.log('   고치는 법 — 셋 중 하나:');
  console.log('     ① 1차 소스로 확인하고 볼트에서 마커를 뗀다 (권장)');
  console.log('     ② 원고에서 그 숫자를 뺀다');
  console.log('     ③ 숫자가 아니라 해석이 미검증이었다면 볼트 표기를 ①형(공백 뒤)으로 되돌린다');
  process.exit(1);
}

console.log('✅ 발행 원고에 인용 금지 숫자 없음');
console.log('⚠️ 이 검사는 ② 표기(숫자 바로 뒤·공백 없음)만 본다. 문장 끝 마커는 사람이 읽는다.');
process.exit(0);
