// check-blog-time.mjs — 블로그 원고에서 **기준점이 낡는 문장**을 잡는다. 2026-09-08 신설 (사용자 지시).
//
// ── 왜 만들었나 ────────────────────────────────────────────────────────────
// 2026-09-08 에 9/14 주간 티스토리를 준비하다 찾았다.
//   `check-rank-claims.mjs:120` 이 `readdirSync(HERE)` 에서 **`post-*.json` 만** 고른다.
//   `check-numbers.mjs` 도 같다. ▶ **블로그 원고는 게이트를 하나도 안 지나가고 있었다.**
//   9/03 에 붙인 발행 직전 게이트 6개는 전부 인스타·스레드 매니페스트 전용이다.
//
// 그래서 손으로 훑었더니 ep-16(9/02 집필 · 9/14 발행)에 두 줄이 있었다:
//     - **8월 15일 ~ 오늘** — ### 발견 N
//     **8월 15일**에 바뀌었습니다. 그날부터 오늘까지 **18일**입니다.
//   🔬 8/15 → 9/02 = 18일이라 **집필일 기준으로는 맞다.** 그런데 독자는 발행일을
//   「오늘」로 읽고, 8/15 → 9/14 = 30일이라 **산수가 안 맞아 보인다.**
//   ★★ **숫자가 틀린 게 아니라 기준점이 낡는다** — check-rank-claims 의
//      「낡는 건 값이 아니라 서수다」와 같은 계열, 다른 축이다.
//
// ── 왜 「오늘」을 통째로 막지 않나 ─────────────────────────────────────────
// ⛔ 서술의 「오늘」은 우리 문체다. 「오늘 그 도구를 돌렸더니 첫 줄에서 죽었습니다」는
//    읽는 사람이 글쓴이의 하루로 자연스럽게 받는다. 막으면 글이 죽는다.
// 🔬 실측: ep-16 에 「오늘」이 10번 나오는데 **문제는 둘뿐이었다.**
//    ep-13(3번)·ep-15(5번)는 이미 발행됐고 산수 기준점으로 쓴 자리가 없다.
// ★ 그래서 **셋이 한 문장에 같이 있을 때만** 막는다:
//      ① 상대 시점 낱말 (오늘·어제·지금·현재·최근 …)
//      ② 구간 표시   (부터·까지·~·사이)
//      ③ 기간 단위나 날짜 (N일·N주·N개월 / N월 N일)
//    「오늘 문서 → 발견 5건」은 ②③이 없어 통과한다. 그게 설계다.
//
// ⛔ 오탐을 내는 게이트는 무시되고, 무시되는 게이트는 없는 것보다 나쁘다.
//    넓히고 싶으면 **먼저 전량에 돌려보고** 몇 건이 새로 걸리는지 세고 나서 넓힌다.
//
// ── 2026-09-09 확장 — **스레드·캡션 매니페스트도 본다** (사용자 지시) ────────
// 📌 왜: 토스 쿠폰 이벤트가 9/9 에 조기 종료된다는 문자를 사용자가 받고 예약분을 보라 했다.
//    쿠폰 문구는 0건이었는데 **다른 게 나왔다** — 9/16 회차가 「이번엔」, 9/17 회차가
//    「다음 주에」라고 적고 있었다. 원고는 9/07 에 썼고 발행은 열흘 뒤다.
//    ⛔ **이번 건은 사용자 제보로 찾았다. 코드가 찾은 게 아니다.**
//
// ★★ 그런데 **위 블로그 규칙(상대+구간+숫자)으로는 둘 다 못 잡는다.** 산수가 없다.
//    🔬 매니페스트 145건 실측: 블로그 규칙 → 2건. 둘 다 이 문제와 무관했다.
//    ▶ 매니페스트는 **다른 축**이다. 낡는 건 산수가 아니라 **집필일과 발행일의 간격**이다.
//
// 🔬 그래서 간격으로 다시 셌다(집필일 = git 최초 커밋일):
//      「어제·내일」 계열 + 간격 2일 이상 ....... 10건 (미발행 4)   <- 무조건 어긋난다
//      「이번 주·다음 주」 + 간격 7일 이상 ....... 6건 (미발행 4)   <- 문맥에 따라 참일 수 있다
//      낱말만 세면 77건이고 대부분 정상 문체다 — 「어제 올린 릴스」는 맞는 말이다.
//    ⛔ 그래서 **낱말로 막지 않는다.** 간격이 축이다.
//
// ★ 차단은 앞의 하나뿐이다. 「어제」는 발행일−1 을 가리키는 **고정 포인터**라
//   간격이 벌어지면 변명의 여지가 없다. 주 단위는 「다음 주에 다시 뵐게요」처럼
//   발행 시점에도 참인 문장이 많아 **경고로만** 둔다.
// ⛔ 「다음 회차」는 아예 안 본다 — 달력이 아니라 발행 순서에 걸린 말이라 안 낡는다.
//
// 사용: node check-blog-time.mjs                    (posts/ + ../naver/drafts/ 전량)
//       node check-blog-time.mjs --only ep-16-....md  (한 회차만)
//       node check-blog-time.mjs --manifest post-t-48-0917.json   (매니페스트 한 회차)
//       node check-blog-time.mjs --manifests                      (매니페스트 전량)
//       node check-blog-time.mjs --dir <경로>         (다른 폴더)
//
// 종료 코드: 0 = 통과 · 1 = 걸린 문장이 있다

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const extraDir = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : null;

// ① 상대 시점 — 발행일이 오면 뜻이 바뀌는 낱말
const REL = /(오늘|어제|그저께|내일|모레|지금|방금|현재|요즘|이번\s?주|지난\s?주|다음\s?주|이번\s?달|지난\s?달|최근)/;
// ② 구간 표시 — 한쪽 끝이 떠 있으면 길이가 변한다
const SPAN = /(부터|까지|사이|[~∼–])/;
// ③ 기간 단위 또는 날짜 — 여기 숫자가 있어야 「산수」가 된다
const SPAN_NUM = /(\d+\s?(일|일간|주|주간|개월|달|년|시간|분)|\d{1,2}\s?월\s?\d{1,2}\s?일)/;
//   ⚠️ 단위 뒤에 자바스크립트 단어경계(역슬래시 b)를 붙이지 않는다 — 한글은 단어문자가 아니라 경계가 안 생긴다.
//   「18일입니다」가 그래서 한 번 새었다(2026-09-08 시험에서 잡음).

// ⛔ 인용·낫표 안의 상대 시점은 세지 않는다 (2026-09-08, 전량 시험에서 오탐 1건).
//   ep-16: 「저는 **「최근」**이라고 생각했는데 18일이었습니다」 — 여기 「최근」은
//   **회상한 말**이지 이 글의 기준점이 아니다. 기준점은 오히려 「18일」 쪽이다.
// ★ 대가로 **낫표로 감싼 진짜 기준점은 놓친다.** 그쪽을 택했다 —
//   오탐을 내는 게이트는 무시되고, 무시되는 게이트는 없는 것보다 나쁘다.
const stripQuoted = (s) => s
  .replace(/[「『][^」』]*[」』]/g, ' ')
  .replace(/"[^"]*"/g, ' ')
  .replace(/'[^']*'/g, ' ');


// ══════════════════════════════════════════════════════════════════
//  매니페스트 모드 — 집필일과 발행일의 간격으로 본다
// ══════════════════════════════════════════════════════════════════
const PUB = path.join(HERE, '..', 'publish');
// ★ `publish.mjs` 의 게이트 호출은 `--only <매니페스트>` 하나로 통일돼 있다.
//   그래서 `--only` 가 `post-*.json` 이면 매니페스트 모드로 알아서 넘어간다 —
//   게이트 목록에 이 파일만 넣으면 되고 호출부에 예외를 만들지 않는다.
const onlyIsManifest = only && /^post-.*\.json$/.test(only);
const manOnly = argv.includes('--manifest') ? argv[argv.indexOf('--manifest') + 1]
  : (onlyIsManifest ? only : null);
const manAll = argv.includes('--manifests');

// ⛔ 고정 포인터 — 발행일에 대해 하루가 딱 정해진다. 간격이 벌어지면 무조건 틀린다.
const HARD = /(어제|그저께|내일|모레)/;
// ⚠️ 주 단위 — 주 경계를 넘으면 뜻이 밀린다. 다만 발행 시점에도 참인 문장이 많다.
const WEEKY = /(이번\s?주|지난\s?주|다음\s?주|저번\s?주)/;
const HARD_GAP = 2;   // 🔬 실측 최소 간격 2일에서 이미 어긋났다 (post-t-05-0827)

// ★★ 예외 — 「어제」가 **우리 발행물**을 가리키면 발행일 기준으로 참이다.
//   연재라서 어제 회차가 실제로 어제 나갔다. 집필 간격과 무관하게 맞는 말이다.
//   🔬 post-week9-sun(9/13): 「어제 문장이 겹친 걸 검사로 잡았다고 **썼는데**」
//      → 9/12 회차(post-week9-sat)가 정확히 그 내용이다. **내 게이트의 오탐이었다.**
//   ⛔ 서술 동사가 붙은 것만 본다(썼다·적었다·올렸다·말했다·글).
//      ⚠️ 처음엔 「편」도 넣었다가 **「편성」이 걸렸다** — post-week8-sun 의
//      「어제 편성으로 겪은 거」는 자기 글이 아니라 사건이고 실제로 어긋난다.
//   🔬 차단 후보 12건에 적용 → 예외 통과 1건 · 여전히 차단 11건.
const SELF_REF = /(어제|그저께)[^.!?]{0,20}(썼|적었|올린|올렸|말한|말했|얘기한|글)/;
const WEEK_GAP = 7;

function 집필일(fp) {
  // ★ 매니페스트에는 집필일 칸이 없다. git 최초 커밋을 집필일로 쓴다.
  //   ⛔ 파일 수정시각(mtime)은 못 쓴다 — 오늘 한 글자만 고쳐도 오늘이 된다.
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%ad', '--date=short', '--', fp],
      { cwd: PUB, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    return out.length ? out[out.length - 1] : null;
  } catch { return null; }
}

function 매니페스트글(j) {
  const out = [];
  if (j.threadsText) out.push(['본문', j.threadsText]);
  if (j.caption) out.push(['캡션', j.caption]);
  (j.threadsReplies || []).forEach((r, i) => {
    const s = typeof r === 'string' ? r : (r && r.text) || '';
    if (s) out.push([`답글${i + 1}`, s]);
  });
  return out;
}

if (manOnly || manAll) {
  const names = readdirSync(PUB)
    .filter((f) => f.startsWith('post-') && f.endsWith('.json'))
    .filter((f) => (manOnly ? f === manOnly : true));

  if (!names.length) {
    // ⛔ 0건을 통과로 끝내지 않는다 — 파일명 오타와 「문제 없음」은 화면에 똑같이 나온다.
    console.error(`⛔ 검사할 매니페스트가 0건이다. --manifest 이름을 확인한다.`);
    if (manOnly) console.error(`   --manifest ${manOnly}`);
    process.exit(1);
  }

  let 막힘 = 0, 경고 = 0, 못잼 = 0;
  for (const f of names.sort()) {
    const j = JSON.parse(readFileSync(path.join(PUB, f), 'utf8'));
    if (!j.publishDate) continue;
    const w = 집필일(f);
    if (!w) {
      // ★ 「못 물어본 것」과 「없는 것」은 다르다 — git 이 답을 안 주면 통과시키고 찍는다.
      못잼 += 1;
      console.log(`   ⚠️ ${f} — 집필일을 못 읽었다(git 기록 없음). 간격 검사를 건너뛴다.`);
      continue;
    }
    const gap = Math.round((Date.parse(j.publishDate) - Date.parse(w)) / 86400000);
    for (const [칸, t] of 매니페스트글(j)) {
      for (const s of t.split(/(?<=[.!?。])\s+|\n+/)) {
        const probe = stripQuoted(s);
        if (!probe.trim()) continue;
        const h = probe.match(HARD);
        if (h && gap >= HARD_GAP && !SELF_REF.test(probe)) {
          막힘 += 1;
          console.log(`\n⛔ ${f} · ${칸} — 「${h[1]}」`);
          console.log(`   집필 ${w} → 발행 ${j.publishDate} (간격 ${gap}일)`);
          console.log(`   ${s.trim().slice(0, 100)}`);
          continue;
        }
        const k = probe.match(WEEKY);
        if (k && gap >= WEEK_GAP) {
          경고 += 1;
          console.log(`\n⚠️ ${f} · ${칸} — 「${k[1]}」 (간격 ${gap}일) · 경고, 막지 않는다`);
          console.log(`   ${s.trim().slice(0, 100)}`);
        }
      }
    }
  }

  console.log(`\n매니페스트 ${names.length}건 검사 · 차단 ${막힘}건 · 경고 ${경고}건${못잼 ? ` · 집필일 못 읽음 ${못잼}건` : ''}`);
  if (막힘) {
    console.log('▶ 「어제·내일」은 발행일을 기준으로 읽힌다. 고정 날짜나 「그날」로 바꾼다.');
    console.log('  예) 「어제 작업 58개를」 → 「9월 1일에 작업 58개를」');
    process.exit(1);
  }
  console.log('✅ 발행일과 어긋나는 시점 표현 없음');
  process.exit(0);
}

// 문장으로 자른다. 마침표가 없는 목록 줄도 한 문장으로 본다.
function sentences(line) {
  return line.split(/(?<=[.!?。])\s+/).filter((s) => s.trim());
}

function scanFile(fp) {
  const hits = [];
  const raw = readFileSync(fp, 'utf8');
  const lines = raw.split('\n');
  let inFront = false, inCode = false;
  lines.forEach((line, idx) => {
    // frontmatter 는 건너뛴다 — written/publishDate 가 여기 있다
    if (idx === 0 && line.trim() === '---') { inFront = true; return; }
    if (inFront) { if (line.trim() === '---') inFront = false; return; }
    // 코드블록은 건너뛴다 — 주석·출력 예시에 날짜가 흔하다
    if (/^\s*```/.test(line)) { inCode = !inCode; return; }
    if (inCode) return;

    for (const s of sentences(line)) {
      const probe = stripQuoted(s);
      if (REL.test(probe) && SPAN.test(probe) && SPAN_NUM.test(probe)) {
        hits.push({ line: idx + 1, text: s.trim(), word: probe.match(REL)[1] });
      }
    }
  });
  return hits;
}

const dirs = extraDir
  ? [extraDir]
  : [path.join(HERE, 'posts'), path.join(HERE, '..', 'naver', 'drafts')].filter(existsSync);

let files = [];
for (const d of dirs) {
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.md')) continue;
    if (only && f !== only) continue;
    files.push(path.join(d, f));
  }
}

if (!files.length) {
  // ⛔ 0건을 통과로 끝내지 않는다 — 파일명 오타와 「문제 없음」은 화면에 똑같이 나온다.
  console.error(`⛔ 검사할 원고가 0건이다. 경로나 --only 이름을 확인한다.`);
  if (only) console.error(`   --only ${only}`);
  process.exit(1);
}

let bad = 0;
for (const fp of files) {
  const hits = scanFile(fp);
  if (!hits.length) continue;
  bad += hits.length;
  console.log(`\n⛔ ${path.basename(fp)}`);
  for (const h of hits) {
    console.log(`   ${String(h.line).padStart(4)}행  「${h.word}」이 산수의 기준점이다`);
    console.log(`         ${h.text.slice(0, 110)}`);
  }
}

console.log(`\n원고 ${files.length}편 검사 · 걸린 문장 ${bad}건`);
if (bad) {
  console.log('▶ 상대 시점을 **고정 날짜**로 바꾼다. 숫자가 틀린 게 아니라 기준점이 낡는 것이다.');
  console.log('  예) 「8월 15일 ~ 오늘」 → 「8월 15일 ~ 9월 2일」');
  console.log('      「그날부터 오늘까지 18일」 → 「그날부터 고칠 때까지 18일」');
  process.exit(1);
}
console.log('✅ 기준점이 떠 있는 문장 없음');
