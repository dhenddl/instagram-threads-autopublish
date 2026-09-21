// check-ai-tell.mjs — 발행 원고의 「AI 티」 중 **기계화되는 축만** 게이트로 본다. 2026-09-03 신설(사용자 지시).
//
// 왜 만들었나:
//   2026-09-03 에 `@conanssam` 의 6단 게이트 글을 분석했다. 저쪽 6단 중 넷은 우리
//   `no-ai-tell` 에 이미 있었고, **점수·등급**과 **재검증 루프**만 없어서 그 둘을 스킬에 넣었다.
//   ★★★ 그런데 그 작업 중에 더 큰 게 나왔다 — `publish.mjs` 가 부르는 게이트는 다섯인데
//        **AI 티 검사는 0건**이었다. 스킬은 내가 대화에서 부를 때만 돌았다.
//        「검사가 도는 것」과 「검사가 막는 것」은 다르다 — 2026-08-28 에 배운 것과 같은 모양이다.
//
// ⛔⛔ 그런데 「AI 티 검사」를 통째로 게이트로 올릴 수 없다. 두 가지 이유가 실측으로 나왔다.
//
//   ① **0절 채우기 점검은 4항목 중 1개만 기계화된다.**
//      숫자·날짜(기계화 O) · 직접 해본 문장(X) · 틀릴 수 있는 주장(X) · 한계 언급(X).
//      0절 규칙은 **「넷 중 2개 이상 비면 중단」**인데, 1개만 재는 검사로는 그 판정을 못 한다.
//      25% 만 보고 막는 게이트는 게이트가 아니라 오탐 발생기다.
//
//   ② **숫자 0개를 막으면 정상 회차가 막힌다.** 2026-09-03 실측: 매니페스트 114개 · 표면 268건 중
//      **숫자 0개가 23건(8.6%)** 이고 그중 18건이 **스레드 본문**이다.
//      🔬 오늘 아침 나간 `post-thread-am-2026-09-03.json` 이 그중 하나인데,
//         게이트 다섯을 통과했고 0절 4항목 중 **셋이 차 있다**(직접 해본 문장 · 틀릴 수 있는
//         주장 「항상 빨간 게이트는 아무도 안 봅니다」 · 한계 「지금도 이 검사가 못 보는 게 있어요」).
//         **숫자만 없다.** AM 스레드는 「어제 무슨 일이 있었나」 서술 형식이라 그게 정상이다.
//      ⛔ 막았으면 **9/04·9/07 아침 스레드도 같이 안 나갔다**(그 두 회차도 숫자 0개다).
//
//   ★★★ 그리고 오늘 아침 그 원고 자체가 이 설계 실수를 경고하고 있었다:
//        *"오탐이 많으면 안 보게 되고, 안 보면 진짜도 같이 놓칩니다."*
//        같은 날 같은 함정에 두 번 빠지지 않기 위해 **차단은 한 축만** 건다.
//
// ── 그래서 판정을 가른다 ─────────────────────────────────────────────
//
//   ⛔ **차단 (exit 2)** — 종결어미 **4연속 이상**.
//      🔬 2026-09-03 실측 분포 (표면 268건): 1연속 208 · 2연속 59 · **3연속 1** · 4연속 이상 **0**.
//      ★ **지금은 한 번도 안 막는다. 그게 정상이다** — `check-virtual-person` 과 같은 계열로,
//        「나중에 생길 회귀」를 위해 미리 걸어두는 것이다. 오늘 0건을 막는 선이라 사고가 안 난다.
//      ⛔ 3연속을 차단선으로 하지 않았다. 그러면 `post-label-underlayer.json` 릴스 캡션이
//         **이미 승인된 원고인데 막힌다** — 그게 정확히 2026-08-28 이 금지한 사고 모양이다.
//
//   ⚠️ **경고 (통과, exit 0)** — 종결어미 3연속 · **릴스 캡션·캐러셀**의 숫자 0개.
//      ⛔ **스레드 본문·답글의 숫자 0개는 아예 검사하지 않는다.** 위 ② 실측대로 정상이다.
//         표면을 섞지 않는다 — 「feedback-ig-surface-terms」.
//      ⚠️ 이 표면 분리는 **데이터에 맞춘 면이 있다**(정직하게 적어둔다). 다만 독립 근거가 있다:
//         릴스·캐러셀은 실측 숫자를 보여주는 형식이고 AM 스레드는 서술 형식이다.
//         🔬 릴스 캡션 숫자 0개 = 1건(`post-feed-spill`) · 캐러셀 = 0건.
//
// ⛔ 목록을 늘리지 않는다. `no-ai-tell` 3-1절(신호 부패)이 금지한다 —
//    널리 공개된 신호는 변별력을 잃고, 목록을 성실히 따르면 「목록 이후의 AI 문체」로 수렴한다.
//    기계화되는 것만 여기 두고, 나머지는 스킬이 대화에서 본다.
//
// ⛔ 전량 검사를 걸지 않는다. `--only <매니페스트>` 로 **자기 회차만** 본다.
//    다른 회차 원고 문제로 오늘 19:00 스레드가 안 나가면 그건 게이트가 아니라 사고다(2026-08-28).
//
// 사용:
//   node check-ai-tell.mjs --only post-xxx.json    # 발행 경로 (publish.mjs 가 부른다)
//   node check-ai-tell.mjs --all                   # 코퍼스 전수 — 분포 확인·임계 재검토용

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDNEWS = path.resolve(HERE, '..', 'cardnews');

const oi = process.argv.indexOf('--only');
const ONLY = oi >= 0 && process.argv[oi + 1] ? path.basename(process.argv[oi + 1]) : null;
const ALL = process.argv.includes('--all');

if (!ONLY && !ALL) {
  console.error('사용법: node check-ai-tell.mjs --only <매니페스트.json>   또는   --all');
  process.exit(1);
}

// ── 임계 (2026-09-03 우리 코퍼스 실측으로 정했다. 남의 숫자를 대지 않는다) ──
const RUN_BLOCK = 4;   // 종결어미 4연속 이상 → 차단. 실측 최댓값이 3이라 오늘 0건.
const RUN_WARN = 3;    // 3연속 → 경고. 실측 1건.

// ── 지표 정의 (style-metrics.mjs 와 같은 정의를 쓴다. 두 곳이 갈리면 안 된다) ──
const flat = (v) => Array.isArray(v) ? v.map(flat).join('\n')
  : (typeof v === 'string' ? v : (v == null ? '' : String(v)));
const stripDeco = (s) => flat(s)
  .replace(/https?:\/\/\S+/g, ' ')      // URL 제외 (Do-NOT: 고유명사·주소)
  .replace(/[#@][^\s#@]+/g, ' ')        // 해시태그·멘션 제외
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');  // 이모지 제외

const sentencesOf = (text) => stripDeco(text)
  .split(/(?<=[.!?])\s+|\n+/)
  .map((s) => s.trim())
  .filter((s) => s.length > 1);

const endingOf = (s) => {
  const t = s.replace(/[)\]"'”’\s.!?…]+$/g, '');
  const m = t.match(/(습니다|합니다|입니다|됩니다|니다|어요|아요|해요|예요|이에요|거든요|네요|죠|다)$/);
  return m ? m[1] : '';
};

// 같은 종결어미가 연속으로 몇 번 나오는지 — 최장 연속과 그 지점의 문장들을 같이 돌려준다.
function endingRuns(text) {
  const sents = sentencesOf(text);
  const endings = sents.map(endingOf);
  const runs = [];
  let i = 0;
  while (i < endings.length) {
    const e = endings[i];
    if (!e) { i += 1; continue; }          // 종결어미를 못 잡은 문장은 연속을 끊는다
    let j = i;
    while (j < endings.length && endings[j] === e) j += 1;
    if (j - i >= RUN_WARN) runs.push({ ending: e, len: j - i, sents: sents.slice(i, j) });
    i = j;
  }
  return runs;
}

// 숫자·날짜 개수 — **릴스 캡션·캐러셀에서만** 본다(위 ② 참조).
const NUM = /(?<![\w가-힣])\d[\d,.]*\s*(?:%|퍼센트|배|건|명|회차|회|개|일|주|개월|월|년|시간|분|초|원|만원|억|천|백|K|k)?/g;
const numCount = (text) => (stripDeco(text).match(NUM) || []).length;

// ── 원고 수집 ──
// ⚠️ 표면마다 성격이 다르다. 섞어서 재면 판정이 흐려진다.
const NUM_SURFACES = new Set(['릴스 캡션', '캐러셀 슬라이드']);   // 숫자 0개를 경고할 표면
const rows = [];
const skipCard = new Set(['slides.json', 'package.json', 'package-lock.json', 'reels-recipes.json', 'deck-roles.json']);

for (const f of readdirSync(HERE).filter((x) => /^post-.*\.json$/.test(x) && (!ONLY || x === ONLY))) {
  let j;
  try { j = JSON.parse(readFileSync(path.join(HERE, f), 'utf8')); } catch { continue; }
  const push = (surface, v) => {
    const t = flat(v);
    if (t.trim()) rows.push({ file: f, surface, text: t });
  };
  push('릴스 캡션', j.caption);
  push('스레드 본문', j.threadsText ?? j.threadsTextOnly);
  push('스레드 답글', j.threadsReplies);

  // ★ 짝이 맞는 캐러셀 슬라이드도 같이 발행되므로 빼면 안 된다.
  const card = path.join(CARDNEWS, f.replace(/^post-/, ''));
  if (existsSync(card) && !skipCard.has(path.basename(card))) {
    try {
      const c = JSON.parse(readFileSync(card, 'utf8'));
      const bits = [];
      for (const s of (c.slides || [])) {
        for (const v of Object.values(s)) {
          if (typeof v === 'string') bits.push(v);
          else if (Array.isArray(v)) bits.push(...v.filter((x) => typeof x === 'string'));
        }
      }
      push('캐러셀 슬라이드', bits.join('\n'));
    } catch { /* skip */ }
  }
}

// ⛔ `--only` 인데 그 파일을 못 찾았으면 **조용히 0건 검사하고 통과하지 않는다.**
//    파일명 오타와 「문제 없음」이 구분이 안 되는 게 이 볼트가 제일 여러 번 당한 모양이다.
if (ONLY && !rows.length) {
  console.error(`⛔ --only ${ONLY} — 그 매니페스트를 못 찾았거나 검사할 원고 칸이 비어 있다.`);
  console.error(`   경로: ${HERE}`);
  process.exit(1);
}

// ── 판정 ──
const blocked = [];
const warned = [];

for (const r of rows) {
  for (const run of endingRuns(r.text)) {
    const where = `${r.surface} (${r.file})`;
    if (run.len >= RUN_BLOCK) blocked.push({ where, run });
    else warned.push({ where, why: `종결어미 「${run.ending}」 ${run.len}연속`, sents: run.sents });
  }
  if (NUM_SURFACES.has(r.surface) && numCount(r.text) === 0) {
    warned.push({ where: `${r.surface} (${r.file})`, why: '숫자·날짜 0개 — 0절 채우기 1항목 비었음', sents: [] });
  }
}

const scope = ONLY ? `--only ${ONLY}` : `전수 ${new Set(rows.map((r) => r.file)).size}회차`;
console.log(`AI 티 게이트 — ${scope} · 표면 ${rows.length}건`);

// ── ⚠️ 이 검사가 **못 읽은 양**을 같이 찍는다 (2026-09-21 추가) ──────────────
//   왜: `endingOf` 가 어미를 못 잡으면 `endingRuns` 가 **그 자리에서 연속을 끊는다**.
//       그래서 못 읽은 문장은 「안 걸린 것」이 아니라 **「연속을 숨긴 것」**이다.
//   🔬 2026-09-21 실측 — 매니페스트 195개 · 문장 5,978개 중 **1,892개(31.6%)가 미포착**.
//      ⚠️ 표면마다 성격이 다르다: 캐러셀 슬라이드가 대부분이고(카드 본문은 **명사구·단문**이라
//         어미가 없는 게 정상이다), 산문 표면은 스레드 본문 16%대 · 답글 19%대 · 릴스 캡션 27%대다.
//         ⇒ **총계 한 숫자로 판정하지 않는다.** 그래서 임계 경고를 안 붙이고 표면별로 찍는다.
//      산문 쪽 미포착은 전부 요체다: 「~할게요」「~많은데요」「~달라요」「~아니에요」「~더라고요」.
//      ⇒ 위 임계 주석의 실측 분포(3연속 최대 1건)는 **깎인 값**이다.
//   발견 경로: 남의 「블로그 주의 표현 10가지」 점검표(노션)를 대조하다가, 그 대체문 10개 중
//      **2개를 이 게이트가 못 읽는** 걸 보고 우리 코퍼스로 되짚었다. 우연한 양성 대조군이었다.
//   ⛔ **임계도 어미 목록도 안 고쳤다.** 고치는 두 안을 다 재봤고 둘 다 기각됐다:
//        · 요 계열 병합 → 신규 차단 17건, 대부분 **이미 발행된 회차**. 게다가 2연속에 몰려 변별력 없음.
//        · 못 잡으면 끝 두 글자로 갈음 → 신규 차단 2건, 둘 다 **발행 완료된 우수 원고**.
//      이미 나간 원고를 막는 게이트는 만들지 않는다(2026-08-28). **영구 red 는 아무도 안 본다.**
//   ▶ 그래서 판정은 그대로 두고 **못 읽은 양만 화면에 남긴다.** 이건 새 판단이 아니라
//     `check-rank-claims` 가 이미 쓰는 규약이다 — *"건너뛴 건수는 화면에 남긴다.
//     조용히 자르면 「전부 통과」로 읽힌다"*.
const 미포착표 = new Map();
for (const r of rows) {
  const v = 미포착표.get(r.surface) ?? { n: 0, m: 0 };
  for (const s of sentencesOf(r.text)) { v.n += 1; if (!endingOf(s)) v.m += 1; }
  미포착표.set(r.surface, v);
}
const 총문장 = [...미포착표.values()].reduce((a, v) => a + v.n, 0);
const 총미포착 = [...미포착표.values()].reduce((a, v) => a + v.m, 0);
if (총문장) {
  const 비율 = (m, n) => `${(m / n * 100).toFixed(1)}%`;
  console.log(`   종결어미 미포착 ${총미포착}/${총문장} (${비율(총미포착, 총문장)}) — 그 문장에서 연속이 끊긴다`);
  for (const [표면, v] of [...미포착표].sort((a, b) => b[1].m - a[1].m)) {
    if (v.n) console.log(`      ${표면} ${v.m}/${v.n} (${비율(v.m, v.n)})`);
  }
  console.log('   ⚠️ 아래 결과를 「연속이 없다」가 아니라 「못 읽은 몫을 빼고 없다」로 읽는다.');
}

if (warned.length) {
  console.log('');
  console.log(`⚠️ 경고 ${warned.length}건 — **막지 않는다.** 사람이 판단할 자리다.`);
  for (const w of warned.slice(0, 12)) {
    console.log(`   · ${w.where} — ${w.why}`);
    for (const s of w.sents) console.log(`       ${s.length > 60 ? s.slice(0, 60) + '…' : s}`);
  }
  if (warned.length > 12) console.log(`   … 그리고 ${warned.length - 12}건 더`);
}

if (blocked.length) {
  console.error('');
  console.error(`⛔⛔ 종결어미가 ${RUN_BLOCK}연속 이상인 자리가 ${blocked.length}건이다.`);
  console.error('   같은 어미가 내리 붙으면 독자가 그 축으로 AI 글을 지목한다 —');
  console.error('   2026-09-03 실측 근거: `@conanssam` 6단 게이트 글이 자기 게이트를 통과했는데');
  console.error('   독자 셋이 **어미 균질함**으로 AI 글이라고 지목했다. 그 축이 저쪽 6단계에 없었다.');
  for (const b of blocked) {
    console.error(`\n──── ${b.where} — 「${b.run.ending}」 ${b.run.len}연속`);
    for (const s of b.run.sents) console.error(`   ${s}`);
  }
  console.error('');
  console.error('▶ 고치는 법: 어미를 **섞는다.** 「~습니다」와 「~해요/~거든요」를 번갈아 쓴다(no-ai-tell 4절).');
  console.error('   ⛔ 문장을 통째로 다시 쓰는 쪽으로 간다. 어미만 바꾸면 4절 위반은 남는다.');
  console.error('⚠️ 게이트가 틀렸다고 판단되면 `--skip-gates` 로 넘길 수 있다. **그때는 이유를 log.md 에 남긴다.**');
  process.exit(2);
}

if (!warned.length) console.log('✅ 걸린 자리 없음');
process.exit(0);
