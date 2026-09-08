// 토스 쉐어링크 발행 게이트
//
// ── 이 게이트가 막는 것 ─────────────────────────────────────────
// ⛔ 1. 알림톡 링크를 그대로 올리는 것
//      매일 오는 링크가 `https://sharelink.toss.im/links/products/{id}?utm_campaign=daily_best` 인데
//      **도메인이 sharelink.toss.im 이라 「쉐어링크」처럼 보이지만 발급된 추적 링크가 아니다.**
//      그대로 올리면 발행도 되고 클릭도 되는데 돈만 안 붙는다 — 몇 주 뒤에나 안다.
//      ★ 일반 「공유하기」보다 더 위험하다. 버튼은 명확히 다른데 이건 공식 채널이 보내준 주소다.
//
// ⛔ 2. 고시문구를 지우는 것
//      토스가 공유 텍스트에 자동으로 넣어준다. 우리가 만들 필요가 없다.
//      그래서 검사 대상이 「넣었는지」가 아니라 **「지우지 않았는지」**다.
//
// ⛔ 3. 고시문구가 링크보다 아래에 오는 것
//      정책 요건이 「추가 클릭 없이 보임」인데 스레드는 긴 글이 접힌다.
//      문구가 접힘 뒤로 넘어가면 위반이다.
//
// ⛔ 4. 대장에 없는 링크
//      출처를 못 대는 링크는 어디서 왔는지 모른다.
//
// ⛔ 5. account=2 매니페스트에 instagram 타깃
//      publish.mjs 가 실행 시점에도 막지만, 발행 전에 잡는 게 낫다.
//
// ⚠️ 6. 금지 카테고리(의료기기·분유·건강기능식품) — 경고만. 사람이 판단한다.
//
// ★ 화이트리스트로 간다: 통과는 `toss.im/_m/{코드}` 뿐이다.
//   막을 대상이 「유출·오류」면 새 항목이 기본 차단이어야 한다.
//   그 덕에 일반 공유 링크 형태를 몰라도 게이트가 성립한다.
//
// 사용: node check-toss.mjs            (publish/*.json 전량)
//       node check-toss.mjs post-x.json

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(HERE, 'toss-links.json');

// ✅ 유일하게 통과하는 형태. 실측: https://toss.im/_m/<8자 코드> (2026-08-25 사용자 제공)
//   ⚠️ 실제 코드는 지우고 자리표시로 두었다 — 이 파일은 공개 자료로 나간다(2026-09-08).
const ISSUED = /https?:\/\/toss\.im\/_m\/[A-Za-z0-9]+/g;
// ⛔ 알림톡이 보내주는 상품 페이지 링크. 발급된 링크가 아니다.
const NOTIFY = /https?:\/\/sharelink\.toss\.im\/links\/products\/\d+/g;
// 그 외 토스 도메인 링크 — 화이트리스트에 없으므로 전부 잡는다
const ANY_TOSS = /https?:\/\/[a-z0-9.-]*toss(?:\.im|\.shopping)[^\s"'\]]*/gi;

// 고시문구. 실물 전체를 요구하지 않는다 — 토스가 문구를 손봐도 살아남게
// 핵심 두 조각만 본다. 대신 「지웠는지」는 확실히 잡힌다.
// ✅ 확정 문구 (2026-08-27, 사용자 실물 확인) — **링크를 발급하면 토스가 같이 준다.**
//    "✱ 이 포스팅은 토스쇼핑 쉐어링크 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
// ⛔ 토스 도움말 문서(`help/policy.md`)에는 **다른 문장**이 적혀 있다
//    ("이 콘텐츠는 … 링크를 통한 구매가 발생하면 일정 수수료를 지급받습니다").
//    ★ 실물이 정본이고 문서가 사본이다. 우리가 문구를 만들어 넣는 게 아니라 받아 쓰는 것이다.
//    ⛔⛔ 볼트의 조사 페이지를 보고 원고 26편을 문서 문구로 「교정」하지 말 것 — 거꾸로 고치는 것이다.
// ⚠️ 아래 정규식은 두 문구를 **둘 다 통과시킨다.** 일부러 느슨하게 뒀다(바로 아래 주석 참조).
//    그래서 이 게이트는 「문구가 실물인가」를 못 가른다. 그건 사람이 본다.
const DISCLOSURE = /토스쇼핑\s*쉐어링크\s*활동의?\s*일환/;
const FEE_WORD = /수수료/;

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { links: [] };

// ── 대장 자체 검사 ─────────────────────────────────────────────
//
// ⛔ 2026-08-25 초판이 낸 경고 4건이 **전부 오탐이었다.** 뺐다:
//    ① "코드는 8자" — 10건 중 9건이 8자라고 규칙을 만들었는데 **7자도 정상**이었다.
//    ② "코드에 l 이나 I 가 있으면 옮겨적기 실수" — base62 라 **정상 문자**다.
//    ★ 표본에서 규칙을 만들어 경고를 냈고, 사용자가 관리자에서 재복사해 확인해줬다.
//    📌 얻은 것: **모양으로 옮겨적기 실수를 잡으려는 시도 자체가 근거가 없다.**
//       진짜 방어는 검사가 아니라 절차다 — **눈으로 옮기지 말고 「복사」 버튼을 쓴다.**
//
// ⛔ 그리고 확인하려고 링크를 열 수도 없다. 우리 클릭이 집계되고
//    운영정책이 "무효 클릭, 자동 실행"을 금지한다.
//
// 그래서 남긴 것은 **근거가 있는 것뿐**이다: 링크 존재 · 고시문구 유무와 위치 · 중복 ·
// 코드에 URL 로 쓸 수 없는 문자가 섞였는지(공백·한글 등 = 진짜 복사 사고).
// ★ KST 로 본다. UTC 로 「오늘」을 잡으면 아침 9시 전까지 오늘 발급분이 미래로 찍힌다 —
//   2026-08-25 에 인사이트 날짜가 정확히 그 이유로 하루 어긋났다.
const TODAY_KST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function auditLedger(l) {
  const out = [];
  const codes = [];
  const rounds = new Map();
  for (const [i, e] of (l.links ?? []).entries()) {
    const txt = String(e['원문'] ?? '');
    const m = txt.match(/https:\/\/toss\.im\/_m\/(\S+)/);
    const label = `대장 ${i + 1}번(${(txt.split('\n')[1] ?? '?').slice(0, 20)})`;
    if (!m) { out.push(`⛔ ${label}: 발급 링크가 없다`); continue; }
    const code = m[1];
    codes.push(code);
    if (!/^[A-Za-z0-9]+$/.test(code)) out.push(`⛔ ${label}: 코드에 쓸 수 없는 문자가 있다 (${code})`);
    if (!/토스쇼핑\s*쉐어링크\s*활동의?\s*일환/.test(txt)) out.push(`⛔ ${label}: 고시문구가 없다`);
    if (txt.indexOf('https://toss.im/_m/') < txt.search(/토스쇼핑\s*쉐어링크/)) out.push(`⛔ ${label}: 링크가 고시문구보다 위다`);

    // ⚠️ 규약 A (2026-08-26): 발급일은 「발급한 날」이라 미래일 수 없다.
    //    초판이 배정일을 이 칸에 적어 미래 날짜가 들어갔고, 다음 세션이 그걸 발급일로 읽었다.
    //    ★ 배정은 사용회차에만 적는다. 이 검사가 그 규약의 되돌림 방지다.
    const issued = e['발급일'];
    if (issued != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(issued))) {
      out.push(`⚠️ ${label}: 발급일 형식이 YYYY-MM-DD 가 아니다 (${issued})`);
    } else if (issued != null && String(issued) > TODAY_KST) {
      out.push(`⚠️ ${label}: 발급일이 미래다 (${issued} > 오늘 ${TODAY_KST}) — 배정일을 적은 것이라면 사용회차 칸으로 옮긴다`);
    }

    // ⚠️ 가격 계열 칸이 되살아났는지 (2026-08-26 사용자 결정 「접는다」)
    //   ⛔ 텍스트를 정규식으로 막지 않는다 — 우리 원고가 「할인율 0 이 두 뜻이었다」처럼
    //      할인율을 **소재로** 쓴다. 그래서 데이터 층에서 끊는다.
    //   ★ 숫자가 대장에 못 들어오면 어떤 골격도 그걸 못 쓴다. 칸이 없는 게 게이트다.
    //   되돌리려면 사용자 결정이 필요하다 — 조건은 toss-links.json 의 「되돌릴 조건」에 있다.
    for (const k of ['가격', '정가', '할인율', '예상수수료']) {
      if (k in e) out.push(`⚠️ ${label}: 「${k}」 칸이 다시 생겼다 — 2026-08-26 에 접기로 한 값이다 (특가는 발행 전에 내려간다)`);
    }

    // ⚠️ 한 회차에 링크가 둘이면 하나는 안 쓰인다 — 조용히 남는다
    const round = e['사용회차'];
    if (round != null) {
      if (!/^t-\d{2,}$/.test(String(round))) out.push(`⚠️ ${label}: 사용회차 형식이 t-NN 이 아니다 (${round})`);
      else if (rounds.has(round)) out.push(`⚠️ 회차 ${round} 에 대장 링크가 둘이다: ${rounds.get(round)} · ${code}`);
      else rounds.set(round, code);
    }
  }
  const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
  for (const d of new Set(dup)) out.push(`⛔ 대장에 같은 코드가 두 번 있다: ${d}`);
  return out;
}
const ledgerWarns = auditLedger(ledger);
const banned = ledger['_금지 카테고리']?.['키워드'] ?? [];
const knownLinks = new Set(
  (ledger.links ?? []).flatMap((l) => [...String(l['원문'] ?? l['붙여넣은원문'] ?? '').matchAll(ISSUED)].map((m) => m[0]))
);

// 매니페스트에서 사람이 읽는 텍스트만 뽑는다(순서 유지 — 위치 검사에 쓴다)
function textsOf(m) {
  const out = [];
  if (m.threadsText) out.push({ where: '스레드 본문', text: String(m.threadsText) });
  (m.threadsReplies ?? []).forEach((r, i) => {
    const t = typeof r === 'string' ? r : (r?.text ?? '');
    if (t) out.push({ where: `답글 ${i + 1}`, text: String(t) });
  });
  if (m.caption) out.push({ where: '캡션', text: String(m.caption) });
  return out;
}

// ★ `--only <파일>` 을 받는다 (2026-08-28). 위치 인자(`check-toss.mjs post-x.json`)도 그대로 둔다.
//   `publish.mjs` 가 발행 직전에 세 게이트를 **같은 문법으로** 부르게 하려고 맞췄다.
//   ⛔ 형제 게이트끼리 호출 규칙이 다르면 호출부에서 하나만 틀리고, 그건 조용히 통과한다.
const oi = process.argv.indexOf('--only');
const argFile = oi >= 0 && process.argv[oi + 1]
  ? basename(process.argv[oi + 1])
  : (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null);
if (argFile && !existsSync(join(HERE, argFile))) {
  // ⛔ 없는 파일을 조용히 0건 검사하고 통과시키지 않는다.
  console.error(`⛔ ${argFile} 을 못 찾았다 (경로: ${HERE})`);
  process.exit(1);
}
const files = argFile
  ? [argFile]
  : readdirSync(HERE).filter((f) => f.startsWith('post-') && f.endsWith('.json')).sort();

let blocked = 0, warned = 0, scanned = 0, touched = 0;

for (const f of files) {
  const p = join(HERE, basename(f));
  if (!existsSync(p)) { console.log(`⛔ 없는 파일: ${f}`); blocked++; continue; }
  let m;
  try { m = JSON.parse(readFileSync(p, 'utf8')); } catch { console.log(`⛔ JSON 파싱 실패: ${f}`); blocked++; continue; }
  scanned++;

  const parts = textsOf(m);
  const whole = parts.map((x) => x.text).join('\n');
  const hasIssued = ISSUED.test(whole); ISSUED.lastIndex = 0;
  const hasNotify = NOTIFY.test(whole); NOTIFY.lastIndex = 0;
  const isAcc2 = String(m.account ?? 1) === '2';

  // 토스와 무관한 매니페스트는 건너뛴다
  const anyToss = [...whole.matchAll(ANY_TOSS)].map((x) => x[0]);
  if (!anyToss.length && !isAcc2) continue;
  touched++;

  const errs = [], warns = [];

  // ⛔ 1. 알림톡 링크
  if (hasNotify) {
    for (const u of whole.match(NOTIFY) ?? []) {
      errs.push(`알림톡 링크다 — 수익이 붙지 않는다: ${u}\n      → 앱에서 「금액이 적힌 위쪽 버튼」으로 발급한 toss.im/_m/… 링크를 쓴다`);
    }
  }

  // ⛔ 화이트리스트 밖의 토스 링크
  for (const u of anyToss) {
    if (/^https?:\/\/toss\.im\/_m\//.test(u)) continue;
    if (NOTIFY.test(u)) { NOTIFY.lastIndex = 0; continue; }  // 위에서 이미 잡았다
    NOTIFY.lastIndex = 0;
    errs.push(`화이트리스트 밖의 토스 링크: ${u}  (통과는 toss.im/_m/… 뿐이다)`);
  }

  if (hasIssued) {
    // ⛔ 2·3. 고시문구 유무와 위치 — 링크가 있는 **그 조각 안**에서 본다
    for (const part of parts) {
      const idxLink = part.text.search(/https?:\/\/toss\.im\/_m\//);
      if (idxLink < 0) continue;
      const hasDisc = DISCLOSURE.test(part.text) && FEE_WORD.test(part.text);
      if (!hasDisc) {
        errs.push(`${part.where}: 제휴 링크가 있는데 고시문구가 없다 — 토스가 넣어준 문구를 지우지 않는다`);
        continue;
      }
      const idxDisc = part.text.search(DISCLOSURE);
      if (idxDisc > idxLink) {
        errs.push(`${part.where}: 고시문구가 링크보다 아래다 — 스레드는 접히므로 「추가 클릭 없이 보임」 요건이 깨진다`);
      }
    }

    // ⛔ 4. 대장 대조
    for (const u of whole.match(ISSUED) ?? []) {
      if (!knownLinks.has(u)) errs.push(`대장에 없는 링크: ${u}  → toss-links.json 의 links[] 에 원문을 넣는다`);
    }

    // ⚠️ 순위 주장 — 순위는 스냅샷이다 (2026-08-26 사용자 결정)
    //   대장 링크는 발급 후 최대 11일 뒤에 발행된다(8/26 발급 → 9/6 발행). 그때 순위는 거의 확실히 다르다.
    //   ★ 발급 링크가 실제로 들어간 회차에만 본다 — 알림톡 칸 이름을 설명하는 회차(「판매 1위 상품」)는
    //     링크가 없어서 걸리지 않는다. 실측으로 t-03 오탐 없음을 확인했다.
    for (const part of parts) {
      const r = part.text.match(/\d+\s*위/);
      if (r) warns.push(`${part.where}: 순위 주장 「${r[0]}」 — 순위는 발행 시점에 이미 다르다. 목록 이름과 「많이 팔린다」만 쓴다`);
    }
  }

  // ⛔ 5. account=2 + instagram
  const targets = m.targets ?? [];
  if (isAcc2 && targets.includes('instagram')) {
    errs.push('account=2 인데 instagram 이 타깃에 있다 — 2계정은 스레드 전용이다');
  }
  if (hasIssued && !isAcc2) {
    warns.push('제휴 링크가 있는데 account 가 2가 아니다 — 본계정으로 나갈 참인지 확인');
  }

  // ⚠️ 6. 금지 카테고리
  for (const k of banned) if (whole.includes(k)) warns.push(`금지 카테고리 키워드: 「${k}」 — 법적 준수 확인이 필요한 품목이다`);

  if (errs.length || warns.length) {
    console.log(`\n── ${f}${isAcc2 ? '  [account=2]' : ''}`);
    for (const e of errs) { console.log(`   ⛔ ${e}`); blocked++; }
    for (const w of warns) { console.log(`   ⚠️ ${w}`); warned++; }
  }
}

if (ledgerWarns.length) {
  console.log('');
  console.log(`── 대장 검사 (${ledger.links?.length ?? 0}건) ──`);
  for (const w of ledgerWarns) {
    console.log(`   ${w}`);
    if (w.startsWith('⛔')) blocked++; else warned++;
  }
  console.log('   ⛔ 링크를 열어서 확인하지 않는다 — 우리 클릭이 집계되고 운영정책이 무효 클릭을 금지한다.');
  console.log('   📌 링크는 눈으로 옮기지 않는다 — 관리자 「링크 > 링크 관리」의 복사 버튼을 쓴다.');
}

console.log('');
console.log(`매니페스트 ${scanned}개 검사 · 토스 관련 ${touched}개 · 대장 링크 ${knownLinks.size}건`);
if (!blocked && !warned) console.log('✅ 차단 사유 없음');
else console.log(`${blocked ? '⛔ 차단 ' + blocked + '건' : ''} ${warned ? '⚠️ 경고 ' + warned + '건' : ''}`.trim());
console.log('⛔ 이 게이트는 링크와 문구만 본다 — 상품이 우리 계정에 맞는지는 사람이 판단한다.');

process.exit(blocked ? 1 : 0);
