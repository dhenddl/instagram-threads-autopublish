// check-rank-claims.mjs — 발행 원고에서 **시간이 지나면 틀려지는 표현**을 잡는다.
// 2026-08-24 신설 (사용자 지시). `check-numbers.mjs` 의 형제 게이트다.
//
// ── 왜 만드는가 ────────────────────────────────────────────────────────────
// 2026-08-24에 사용자가 물었다: *"인사이트는 측정할 때마다 미세하게 바뀔 텐데,
// 이미 만들어둔 릴스·캐러셀과 예약한 블로그 글을 그때그때 고치는 게 맞는 방향인가?"*
//
// 그날 잡힌 것들을 종류로 갈라보니 답이 나왔다.
//
//   · **순수 드리프트** (83.6→82.9 · 112→113) — 결론이 안 바뀐다. **쫓지 않는다.**
//     원고에 측정 시점 한 줄이 있으면 그 값은 영구히 맞다.
//   · **모집단 카운트** (「일곱 개 중」·「열 개 중」·「21개 중」) — **문장이 거짓이 된다.**
//     발행 매니페스트에서 자기 모집단을 세는 표현 5건 중 **3건이 이미 틀렸다.**
//     외부·고정 모집단(「신기능 6개 중」·「매니페스트 24개 중」)은 0건이었다.
//   · **지표 라벨** (「완주율 1등은 이탈 65.5%」) — **검증하면 반대로 나온다.**
//     65.5%는 `reels_skip_rate`이고 볼트 정의상 완주율은 `avg_watch ÷ 길이`다.
//
// ★ 핵심: **낡는 건 값이 아니라 서수(順序)다.**
//     "65.5%. 종전 최고가 69.4%였어요"  → 역사적 비교라 **영구히 참**
//     "65.5%. 열 개 중 1등입니다"        → **다음 릴스에 틀림**
//   → 순위·카운트·최상급을 안 쓰면 드리프트를 쫓을 일이 없다. 이 게이트가 그걸 강제한다.
//
// ── 검사 3종 ──────────────────────────────────────────────────────────────
//   ⛔ HARD-1  자기 콘텐츠 모집단 카운트 (릴스 N편 중 …)
//              → 시점을 병기해도 모집단은 자란다. 면제 없음.
//   ⛔ HARD-2  지표 라벨 혼용 (한 문장에 「완주율」 + 「이탈」 + 숫자%)
//   ⚠️ WARN    순위·최상급 (N위 · 뒤에서 N번째 · 역대 최악 · 제일 낮다 …)
//              → 안 낡는 경우도 있어(8/14의 89.0은 계속 역대 최악일 것) 사람이 읽는다.
//              **오탐을 내는 게이트는 무시되고, 무시되는 게이트는 없는 것보다 나쁘다.**
//              → 「신호를 믿으면 안 되는 자리」 처방 4단계 ⑤
//
// ── 왜 자기 명사 목록으로 좁히는가 ────────────────────────────────────────
// 「신기능 6개 중 4개」는 인스타가 정한 고정 모집단이라 안 자란다.
// 「릴스 열 개 중」은 우리가 발행할수록 자란다. **주어가 우리 것인지가 갈림선이다.**
//
// 사용: node pipeline/publish/check-rank-claims.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linesPath, listLineSlugs, LINES_DIR } from '../cardnews/lines-path.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CARDNEWS = path.join(ROOT, 'pipeline', 'cardnews');
const NAVER = path.join(ROOT, 'pipeline', 'naver');

// ── 규약 ──────────────────────────────────────────────────────────────────

// 우리가 발행할수록 늘어나는 것들. 이 뒤에 붙은 카운트는 시간의 함수다.
// ★ 2026-08-24 보강: `슬라이드`·`카드`·`답글`을 추가했다.
//   8/26 예약분의 *"슬라이드 165장 중 155장"* 을 초판이 놓쳤다 — 명사 목록에 `슬라이드`가 없었다.
//   (그 건은 재측정에서 안 낡아 무해했지만, 캐러셀을 더 내면 반드시 틀어진다.)
const OURS = '릴스|스레드|캐러셀|카드뉴스|슬라이드|카드|답글|게시물|회차|영상|글|포스트|편';

// 한글 수사 + 아라비아 숫자
const NUMWORD = '한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두|열세|열네|열다섯|스무|스물|서른';
const COUNT = String.raw`(?:(?:${NUMWORD})|\d+)\s?(?:개|편|건|장|회|명|줄)`;

// HARD-1 — 자기 명사와 카운트가 20자 안에 붙어 있고 「중」이 따라올 때
const POP_COUNT = new RegExp(String.raw`(?:${OURS})[^.\n]{0,20}?${COUNT}\s?중`, 'g');

// ★ 2026-08-24 보강 — 시점이 박힌 카운트는 통과시킨다.
//   초판은 *"시점을 병기해도 통과시키지 않는다"* 였다. 8/26 예약분에서 그게 너무 뻣뻣하다는 게 드러났다:
//   *"슬라이드 165장 중 155장은 코드가 쓰고, 10장만 손으로"* 에서 **카운트가 소재 자체**다
//   (표 카드 10장과 수동 alt 10장이 정확히 겹친다는 게 그 글의 발견이다). 빼면 글이 사라진다.
//   → 갈림선을 다시 그었다:
//       · 카운트 + **순위·최상급** → ⛔ 차단. 모집단이 자라면 순위가 뒤집힌다.
//       · 카운트 + **시점**       → ✅ 통과. "8월 21일 기준 165장"은 역사적 사실이라 영구히 참이다.
//   실제 실패 4건에 대조해보면 전부 앞쪽이다 — 「열 개 중 제일 낮아요」·「일곱 개 중 꼴찌」·
//   「글 21개 중 하나가」·「열 개 중 각각 2위와 8위」. 시점이 붙은 건 하나도 없었다.
const STAMPED = /(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s?월\s?\d{1,2}\s?일|\d{1,2}\/\d{1,2}|그때까지|당시|현재까지)/;

// HARD-2 — 한 문장에 완주율 + 이탈(또는 건너뛰기) + 숫자%
const LABEL_MIX = /[^.\n]*완주율[^.\n]*(?:이탈|건너뛰기|skip)[^.\n]*\d+(?:\.\d+)?\s?%[^.\n]*/gi;
const LABEL_MIX_REV = /[^.\n]*(?:이탈|건너뛰기|skip)[^.\n]*\d+(?:\.\d+)?\s?%[^.\n]*완주율[^.\n]*/gi;

// WARN — 순위·최상급
const RANK = new RegExp([
  String.raw`\d+\s?(?:위|등)\b`,
  String.raw`뒤에서\s?(?:${NUMWORD}|\d+)\s?번째`,
  String.raw`꼴찌`,
  String.raw`역대\s?최[고악저]`,
  String.raw`제일\s?(?:낮|높|좋|나쁜|안|많|적)`,
  String.raw`가장\s?(?:낮|높|좋|나쁜|많|적)`,
  String.raw`최고\s?기록`,
  String.raw`신기록`,
  String.raw`(?:1|일)등`,
].join('|'), 'g');

// ── 이미 나간 것은 검사하지 않는다 ────────────────────────────────────────
// ★ 이게 이 게이트가 무시되지 않게 하는 장치다.
//   2026-08-24 첫 실행에서 11건이 걸렸는데 **6건이 이미 발행된 원고**였다
//   (8/8 「릴스 10건 중」 · 8/19 「일곱 개 중」 · 8/21 「열 개 중」·「완주 1등」 · 8/23 「글 21개 중」).
//   인스타는 릴스 화면 텍스트를 수정할 수 없고 스레드 본문도 되돌릴 수 없다.
//   **못 고치는 것을 계속 물면 게이트가 영구 red가 되고, 영구 red인 게이트는 아무도 안 본다.**
//   → 발행 후 오류는 게이트가 아니라 **다음 회차의 소재**로 다룬다(그게 이 계정 방식이다).
//   ⚠️ 건너뛴 건수는 **화면에 남긴다** — 조용히 자르면 "전부 통과"로 읽힌다.
const TODAY = new Date().toISOString().slice(0, 10);
const skipped = [];
const isPast = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < TODAY;

// ★ `--only <매니페스트파일명>` — **그 한 회차만** 검사한다 (2026-08-28 신설).
//   `publish.mjs` 가 발행 직전에 부르기 때문이다. 전량 검사면 **다른 회차 원고의 문제로
//   오늘 발행이 막힌다** — 그건 게이트가 아니라 사고다. 전량 검사는 손으로 돌릴 때 그대로 남는다.
const oi = process.argv.indexOf('--only');
const ONLY = oi >= 0 && process.argv[oi + 1] ? path.basename(process.argv[oi + 1]) : null;

// ── 원고 수집 ─────────────────────────────────────────────────────────────
const copy = [];
const push = (file, surface, v) => {
  const t = Array.isArray(v) ? v.join('\n') : (typeof v === 'string' ? v : '');
  if (t.trim()) copy.push({ file, surface, text: t });
};

// slug -> publishDate (릴스 화면·훅 판정용)
const slugDate = new Map();

// ① 발행 매니페스트 — 발행일이 지난 것은 제외
for (const f of readdirSync(HERE).filter((x) => /^post-.*\.json$/.test(x) && (!ONLY || x === ONLY))) {
  try {
    const j = JSON.parse(readFileSync(path.join(HERE, f), 'utf8'));
    // ⛔ `--only` 로 지목된 회차는 **과거 발행일이어도 건너뛰지 않는다.**
    //    발행 직전에 부르는데 「지났으니 안 본다」로 통과시키면 게이트가 없는 것과 같다.
    //    (재발행·날짜 밀림 같은 정상 상황에서 실제로 과거 날짜가 들어온다.)
    if (!ONLY && isPast(j.publishDate)) { skipped.push(`${f} (${j.publishDate})`); continue; }
    push(f, '릴스 캡션', j.caption);
    push(f, '스레드 본문', j.threadsText);
    push(f, '스레드 답글', j.threadsReplies);
  } catch { /* skip */ }
}

// ② 캐러셀 슬라이드
const skipCard = new Set(['package.json', 'package-lock.json', 'deck-roles.json']);
// ★ `--only` 면 짝이 맞는 슬라이드 하나만 본다 — 캐러셀 회차는 슬라이드 글자도 같이 발행된다.
if (existsSync(CARDNEWS) && !(ONLY && !ONLY.startsWith('post-'))) {
  for (const f of readdirSync(CARDNEWS).filter((x) => x.endsWith('.json') && !skipCard.has(x)
      && (!ONLY || `post-${x}` === ONLY))) {
    try {
      // 슬라이드 파일에는 발행일이 없다 → 같은 이름의 매니페스트에서 찾는다(`week3-recap.json` ↔ `post-week3-recap.json`).
      const mf = path.join(HERE, `post-${f}`);
      if (existsSync(mf)) {
        let when; try { when = JSON.parse(readFileSync(mf, 'utf8')).publishDate; } catch { /* skip */ }
        if (isPast(when)) { skipped.push(`cardnews/${f} (${when})`); continue; }
      }
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

// ③ ★ 릴스 레시피 — 훅 배지·훅 문장은 **영상에 구워진다.**
//    `check-numbers.mjs` 는 이 파일을 건너뛴다. 2026-08-24에 「릴스 10편」이 여기 숨어 있었다.
const RECIPES = path.join(CARDNEWS, 'reels-recipes.json');
if (existsSync(RECIPES)) {
  try {
    const j = JSON.parse(readFileSync(RECIPES, 'utf8'));
    for (const r of (j.recipes || [])) {
      if (r.slug && r.publishDate) slugDate.set(r.slug, r.publishDate);
      if (isPast(r.publishDate)) { skipped.push(`reels-recipes.json:${r.slug} (${r.publishDate})`); continue; }
      const bits = [r.hookBadge, r.hookText, r.hookSub, r.outro, r.title].filter((x) => typeof x === 'string');
      if (bits.length) push(`reels-recipes.json (${r.slug})`, '릴스 훅', bits.join('\n'));
    }
  } catch { /* skip */ }
}

// ④ ★ 릴스 화면 텍스트 — `cardnews/lines/<slug>.txt` 는 렌더 **입력**이다. 영상에 그대로 뜬다.
//    발행일은 레시피에서, 없으면 대응 매니페스트에서 찾는다.
// ⛔ 2026-08-26: 경로가 `out/<slug>/lines.txt` → `lines/<slug>.txt` 로 바뀌었다.
//    `out/` 이 .gitignore 로 통째 제외돼 있어 원본이 백업 없이 살고 있었기 때문이다.
//    경로 규칙은 cardnews/lines-path.mjs 가 단일 출처다 — 소비자가 3곳이라 각자 박으면 갈린다.
//    `_` 접두 스크래치 제외는 그 모듈이 한다(`_assemble-01` 등, 발행물 아님).
const lineSlugs = listLineSlugs();
// ⛔ 0건이면 이 절 전체가 조용히 통과한다 — 「검사했다」와 「볼 게 없었다」가 구별되지 않는다.
//   레시피가 있는데 대본이 하나도 없으면 그건 정상이 아니라 경로가 어긋난 것이다.
if (!lineSlugs.length && slugDate.size > 0) {   // ★ Map 이다 — Object.keys 는 항상 0 이라 가드가 안 걸린다
  console.log(`⛔ 릴스 레시피는 있는데 대본이 0건이다 — ${LINES_DIR} 를 확인한다.`);
  console.log('   경로가 어긋나면 이 검사는 릴스 화면을 하나도 안 보고 통과한다.');
  process.exitCode = 1;
}
for (const slug of lineSlugs) {
  const p = linesPath(slug);
  if (!existsSync(p)) continue;
  let when = slugDate.get(slug);
  if (!when) {
    const mf = path.join(HERE, `post-${slug}.json`);
    if (existsSync(mf)) { try { when = JSON.parse(readFileSync(mf, 'utf8')).publishDate; } catch { /* skip */ } }
  }
  if (isPast(when)) { skipped.push(`lines/${slug}.txt (${when})`); continue; }
  push(`lines/${slug}.txt`, '릴스 화면', readFileSync(p, 'utf8'));
}

// ⑤ 네이버·블로그 초안 (예약 발행분) — 파일명 앞 날짜로 판정
for (const sub of ['drafts', 'images']) {
  const dir = path.join(NAVER, sub);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!statSync(p).isFile()) continue;
    const dm = f.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dm && isPast(dm[1])) { skipped.push(`naver/${sub}/${f}`); continue; }
    if (f.endsWith('.md')) {
      // ★ 네이버 초안은 위쪽이 **발행 안 되는 안내 블록**이다(붙여넣기 시작선이 따로 있다).
      //   거기에는 「「열 개 중」을 뺐습니다」처럼 **정정 기록**이 들어가서 그대로 읽으면 오탐이 된다.
      //   2026-08-24에 실제로 그 오탐이 났다 — 고친 사실을 적어둔 줄이 걸렸다.
      const raw = readFileSync(p, 'utf8');
      const cut = raw.indexOf('여기부터 복사');
      const body = cut === -1 ? raw : raw.slice(raw.indexOf('\n', cut) + 1);
      push(`naver/${sub}/${f}`, '네이버 원고', body);
    }
    else if (f.endsWith('.json')) {
      try {
        const j = JSON.parse(readFileSync(p, 'utf8'));
        const bits = [];
        const walkVal = (v) => {
          if (typeof v === 'string') bits.push(v);
          else if (Array.isArray(v)) v.forEach(walkVal);
          else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== '_note') walkVal(x); });
        };
        walkVal(j);
        if (bits.length) push(`naver/${sub}/${f}`, '네이버 이미지', bits.join('\n'));
      } catch { /* skip */ }
    }
  }
}

// ⑥ 티스토리 원고 (2026-08-31 추가)
//
// ⛔⛔ 왜 늦게 붙었나: **네이버 원고는 이 게이트가 보는데 티스토리 원고는 아무 게이트도 안 봤다.**
//   2026-08-31 실측 — `blog/posts/*.md` 를 읽는 건 `check-schedule.mjs`(날짜만)뿐이었다.
//   ★★ 두 블로그를 같은 공정으로 쓰는데 **한쪽만 검사받고 있었다.** 채널을 늘릴 때
//     **재는 도구도 같이 늘려야 한다** — 2계정 개통 때 인사이트 스크립트가 한쪽만 보던 것과 같은 모양이다.
//
// ★ 날짜는 **프론트매터 `publishDate`** 로 본다. 파일명에도 날짜가 있지만
//   `check-schedule.mjs` 가 프론트매터를 정본으로 쓴다 — **두 곳을 보면 갈린다.**
//   ⚠️ `publishDate` 가 없으면 **건너뛰지 않고 검사한다.** 날짜를 모르는 걸
//     「이미 나갔다」로 처리하면 조용히 빠진다. 모르면 보는 쪽이 안전하다.
//
// ⚠️ 프론트매터는 **발행되지 않는 메타데이터**다(sources·공개금지 등). 네이버 초안의
//   안내 블록과 같은 이유로 잘라낸다 — 거기 적힌 정정·출처 기록이 그대로 오탐이 된다.
const TISTORY = path.join(ROOT, 'pipeline', 'blog', 'posts');
if (existsSync(TISTORY)) {
  for (const f of readdirSync(TISTORY)) {
    if (!f.endsWith('.md')) continue;
    const raw = readFileSync(path.join(TISTORY, f), 'utf8');
    const dm = raw.match(/^publishDate:\s*(\d{4}-\d{2}-\d{2})/m);
    if (dm && isPast(dm[1])) { skipped.push(`blog/posts/${f} (${dm[1]})`); continue; }
    // YAML 프론트매터(--- … ---)를 떼고 본문만 본다.
    let body = raw;
    if (raw.startsWith('---')) {
      const end = raw.indexOf('\n---', 3);
      if (end !== -1) body = raw.slice(raw.indexOf('\n', end + 1) + 1);
    }
    push(`blog/posts/${f}`, '티스토리 원고', body);
  }
}

// ── 판정 ──────────────────────────────────────────────────────────────────
const hardPop = [], hardLabel = [], warn = [];
const line = (text, idx) => {
  const s = text.lastIndexOf('\n', idx) + 1;
  const e = text.indexOf('\n', idx);
  return text.slice(s, e === -1 ? undefined : e).trim().slice(0, 110);
};

for (const d of copy) {
  for (const m of d.text.matchAll(POP_COUNT)) {
    const ctx = line(d.text, m.index);
    if (STAMPED.test(ctx)) continue;   // 시점이 박힌 카운트는 역사적 사실이라 통과
    hardPop.push({ ...d, hit: m[0].trim(), ctx });
  }
  for (const re of [LABEL_MIX, LABEL_MIX_REV]) {
    for (const m of d.text.matchAll(re)) {
      hardLabel.push({ ...d, hit: m[0].trim().slice(0, 110) });
    }
  }
  const seen = new Set();
  for (const m of d.text.matchAll(RANK)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    warn.push({ ...d, hit: m[0].trim(), ctx: line(d.text, m.index) });
  }
}

// ── 출력 ──────────────────────────────────────────────────────────────────
console.log(`발행 원고 ${copy.length}건 검사 (매니페스트 · 캐러셀 · 릴스 훅 · 릴스 화면 · 네이버)`);
if (skipped.length) {
  console.log(`⏭️  이미 발행돼 제외 ${skipped.length}건 — 못 고치는 것이라 게이트 대상이 아니다(다음 회차 소재로 다룬다):`);
  for (const s of skipped) console.log(`      ${s}`);
}
console.log('');

if (warn.length) {
  console.log(`⚠️ 순위·최상급 ${warn.length}건 — 게이트를 걸지 않는다. 값 비교로 바꿀 수 있는지 사람이 본다.`);
  const byFile = new Map();
  for (const w of warn) {
    if (!byFile.has(w.file)) byFile.set(w.file, []);
    byFile.get(w.file).push(w.hit);
  }
  for (const [f, hits] of byFile) console.log(`   ${f}  ← ${hits.join(' · ')}`);
  console.log('');
}

let bad = false;

if (hardLabel.length) {
  bad = true;
  console.log(`⛔ 지표 라벨 혼용 ${hardLabel.length}건 — 검증하면 반대로 나온다`);
  for (const h of hardLabel) {
    console.log(`   ${h.surface} (${h.file})`);
    console.log(`      └ ${h.hit}`);
  }
  console.log('');
  console.log('   볼트 정의: 완주율 = `ig_reels_avg_watch_time` ÷ 영상 길이');
  console.log('              이탈률/건너뛰기 = `reels_skip_rate` (3초 지표)');
  console.log('   → 둘은 다른 지표다. skip 값을 완주율로 부르면 숫자가 검증에서 뒤집힌다.\n');
}

if (hardPop.length) {
  bad = true;
  console.log(`⛔ 자기 모집단 카운트 ${hardPop.length}건 — 발행할수록 틀려진다`);
  for (const h of hardPop) {
    console.log(`   「${h.hit}」  ${h.surface} (${h.file})`);
    console.log(`      └ ${h.ctx}`);
  }
  console.log('');
  console.log('   고치는 법 — 둘 중 하나:');
  console.log('     ① 카운트를 지우고 **값 비교**로 바꾼다 (권장)');
  console.log('        ⛔ "65.5%. 릴스 열 개 중 제일 낮습니다"');
  console.log('        ✅ "65.5%. 종전 최고가 7월 28일의 69.4%였어요"   ← 역사적 비교라 안 낡는다');
  console.log('     ② 카운트가 소재 자체라면 **시점을 문장에 박는다**');
  console.log('        ✅ "8월 21일 기준 슬라이드 165장 중 155장"      ← 역사적 사실이라 영구히 참');
  console.log('     ⛔ 단 순위·최상급이 같이 붙으면 시점으로도 못 막는다 — 모집단이 자라면 순위가 뒤집힌다.\n');
}

if (bad) process.exit(1);

console.log('✅ 자기 모집단 카운트 없음 · 지표 라벨 혼용 없음');
console.log('⚠️ 순수 드리프트(reach·views·avg_watch·skip)는 이 게이트가 보지 않는다 — 시점을 병기하고 쫓지 않는다.');
process.exit(0);
