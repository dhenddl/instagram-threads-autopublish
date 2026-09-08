// AI 가상인물 표시 게이트 — 공정위 「추천·보증 등에 관한 표시·광고 심사지침」
//
// ── 근거 (1차) ─────────────────────────────────────────────────
// 공정거래위원회 소비자정책총괄과 (044-200-4415)
// 「추천·보증 등에 관한 표시·광고 심사지침」 개정 · **시행 2026-06-01**
//   ㅇ 추천·보증 주체의 새로운 유형으로 **「가상인물」 신설**
//   ㅇ 매체별 표시문구·표시방법 구체화
//     - **문자 중심 매체**: 제목 또는 **첫부분**에 「AI를 기반으로 생성된 가상인물이
//       포함된 게시물」·「가상인물 포함」 등의 문구 표시.
//       + 가상인물이 등장하는 동안 **가상인물과 근접한 위치**에 「가상인물」 표시
//     - **사진·영상 매체**: 가상인물이 등장하는 동안 **근접한 위치**에 「가상인물」 표시
// 출처: 「2026년 하반기부터 이렇게 달라집니다」(정부 합동) 해당 항목
//
// ── 왜 만들었나 ────────────────────────────────────────────────
// ⛔ **시행 3개월이 지나도록 볼트에 0건이었다.** 2026-08-28 에 정책 자료를 훑다 찾았다.
//
// 우리는 두 조건을 **둘 다** 갖고 있다:
//   ① AI 가상인물 — Flow 로 만든 캐릭터(dhenddl_P·dhenddl_Q)가 릴스에 등장한다
//   ② 경제적 이해관계 — 토스 쉐어링크 제휴 링크를 단다
//
// ★★ 그런데 **같은 게시물에서 겹친 적이 0건이다.** 2026-08-28 실측:
//        toss 문자열이 든 매니페스트   26건
//        그중 본계정(account≠2)         0건   ← 전부 2계정
//    AI 캐릭터는 **본계정 릴스**, 제휴 링크는 **2계정 텍스트 스레드**다.
//
// ⚠️ **이건 설계가 아니라 우연이다.** 계정이 갈려 있어서 안 걸린 것뿐이고,
//    본계정에 제휴를 붙이는 순간 겹친다 — 그리고 우리는 실제로 그걸 검토한 적이 있다
//    (2026-08-28 네이티브 제휴 표면 조사).
// ⛔ 그때 막을 게 없었다. `check-toss.mjs` 는 **고시문구만** 본다.
//    게다가 구조상 **토스 링크가 없는 매니페스트를 건너뛴다** — 다른 제휴가 생기면 안 본다.
//    그래서 형제 게이트로 따로 뒀다.
//
// ── 이 게이트가 하는 일 ────────────────────────────────────────
// ★ **판정하지 않는다. 판단을 강제한다.**
//   「이 게시물에 가상인물이 등장하나」는 코드가 알 수 없다. 알 수 있는 건
//   **「위험 조건이 겹쳤는데 아무도 판단을 안 적었다」**뿐이고, 그게 진짜 사고 지점이다.
//
//   경제적 이해관계 ∧ 가상인물 후보  →  매니페스트에 `virtualPerson` 이 **있어야** 통과
//     · `false` → 사람이 「가상인물 아님」이라고 선언한 것. 통과.
//     · `true`  → 표시 검사로 간다.
//     · 없음    → ⛔ 차단. **모르는 채로 나가는 걸 막는다.**
//
// ⛔ **영상 화면 안의 표시는 코드가 못 본다.** 「가상인물과 근접한 위치」는 오버레이다.
//    그래서 이미지·영상 타깃이 있으면 `virtualPersonOverlay: true`(사람 확인)를 요구한다.
//    ★ 「못 보는 것」을 「통과」로 적지 않는다 — 볼트의 「신호를 믿으면 안 되는 자리」 원칙.
//
// ⚠️ 이 게이트는 **법률 판단을 하지 않는다.** 우리가 심사지침 적용 대상인지는 사람이 정한다.
//    코드는 「겹쳤다」와 「판단이 적혔다」만 본다.
//
// 사용: node check-virtual-person.mjs                 (publish/post-*.json 전량)
//       node check-virtual-person.mjs --only post-x.json

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── 경제적 이해관계 신호 ───────────────────────────────────────
// ⛔ `account === 2` 를 신호로 쓰지 않는다. 2계정에도 **무링크 회차**가 있다
//    (2026-08-28 사용자 결정으로 t-11·16·17·20·25 에서 링크를 뺐다).
//    「2계정이니까 광고」로 잡으면 그 다섯 편이 매번 걸린다 — 게이트가 아니라 소음이다.
const ISSUED_LINK = /https?:\/\/toss\.im\/_m\/[A-Za-z0-9]+/;
const DISCLOSURE = /쉐어링크\s*활동의?\s*일환|수수료를?\s*제공받/;

// ── 가상인물 후보 신호 ─────────────────────────────────────────
// ⚠️ `dhenddl_t` 는 **2계정 핸들**이지 캐릭터가 아니다. `_[PQ]` 로만 잡는다.
const CHARACTER = /dhenddl_[PQ]\b/;
// 표시 문구. 「가상인물 포함」·「AI를 기반으로 생성된 가상인물이 포함된 게시물」 둘 다 걸린다.
const MARK = /가상\s*인물/;

// 사람이 읽는 텍스트만 뽑는다 (순서 유지 — 「첫부분」 검사에 쓴다)
function textsOf(m) {
  const out = [];
  if (m.threadsText) out.push({ where: '스레드 본문', text: String(m.threadsText), 문자매체: true });
  (m.threadsReplies ?? []).forEach((r, i) => {
    const t = typeof r === 'string' ? r : (r?.text ?? '');
    if (t) out.push({ where: `답글 ${i + 1}`, text: String(t), 문자매체: true });
  });
  if (m.caption) out.push({ where: '캡션', text: String(m.caption), 문자매체: true });
  return out;
}

// ★ `--only <파일>` — 형제 게이트(check-toss·check-numbers·check-rank-claims)와 같은 문법.
//   ⛔ 호출 규칙이 다르면 publish.mjs 호출부에서 하나만 틀리고, 그건 조용히 통과한다.
const oi = process.argv.indexOf('--only');
const argFile = oi >= 0 && process.argv[oi + 1]
  ? basename(process.argv[oi + 1])
  : (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null);
if (argFile && !existsSync(join(HERE, argFile))) {
  // ⛔ 없는 파일을 조용히 0건 검사하고 통과시키지 않는다. 오타와 「문제 없음」은 달라야 한다.
  console.error(`⛔ ${argFile} 을 못 찾았다 (경로: ${HERE})`);
  process.exit(1);
}
const files = argFile
  ? [argFile]
  : readdirSync(HERE).filter((f) => f.startsWith('post-') && f.endsWith('.json')).sort();

let blocked = 0, warned = 0, scanned = 0;
let 광고만 = 0, 가상인물만 = 0, 겹침 = 0;

for (const f of files) {
  const p = join(HERE, basename(f));
  let m;
  try { m = JSON.parse(readFileSync(p, 'utf8')); } catch { console.log(`⛔ JSON 파싱 실패: ${f}`); blocked++; continue; }
  scanned++;

  const parts = textsOf(m);
  const whole = parts.map((x) => x.text).join('\n');
  const targets = m.targets ?? [];

  // ① 경제적 이해관계가 있나
  const 광고 = ISSUED_LINK.test(whole) || DISCLOSURE.test(whole);
  // ② 가상인물 후보인가 — AI 생성물 플래그 또는 캐릭터 이름
  const 후보 = m.isAiGenerated === true || CHARACTER.test(whole);

  if (광고 && !후보) 광고만++;
  if (!광고 && 후보) 가상인물만++;
  if (!(광고 && 후보)) continue;
  겹침++;

  const errs = [], warns = [];
  const decl = m.virtualPerson;

  if (decl === undefined) {
    errs.push(
      '경제적 이해관계와 AI 가상인물 조건이 **한 게시물에서 겹쳤는데** 판단이 안 적혀 있다.\n' +
      '      → 매니페스트에 `"virtualPerson": false`(가상인물 아님) 또는 `true` 를 적는다.\n' +
      '      → 근거: 공정위 「추천·보증 등에 관한 표시·광고 심사지침」(시행 2026-06-01)'
    );
  } else if (decl === false) {
    // 사람이 아니라고 선언했다. 통과시키되 흔적은 남긴다.
    warns.push('virtualPerson: false 로 선언됨 — 가상인물이 등장하지 않는다는 사람 판단이다');
  } else if (decl === true) {
    // ⛔ 문자 매체: 제목 또는 **첫부분**. 스레드에는 제목이 없으므로 **첫 줄**로 본다.
    //    ★ 느슨하게 잡지 않는다 — 「첫 문단 어딘가」로 두면 접힘 뒤로 넘어갈 수 있고,
    //      그건 고시문구에서 이미 겪은 실패다(check-toss 3번).
    for (const part of parts) {
      if (!part.문자매체) continue;
      const firstLine = part.text.split('\n')[0] ?? '';
      if (!MARK.test(firstLine)) {
        errs.push(`${part.where}: 첫 줄에 「가상인물」 표시가 없다 — 지침은 「제목 또는 첫부분」을 요구한다`);
      }
    }
    // ⛔ 화면 안 표시는 코드가 못 본다 → 사람 확인을 요구한다
    const 시각매체 = targets.includes('instagram') || (m.images ?? []).length > 0 || !!m.video;
    if (시각매체 && m.virtualPersonOverlay !== true) {
      errs.push(
        '이미지·영상이 나가는데 `virtualPersonOverlay: true` 가 없다.\n' +
        '      → 지침은 「가상인물이 등장하는 동안 근접한 위치에 표시」를 요구한다.\n' +
        '      ⛔ 이건 코드가 확인할 수 없다 — 렌더 결과를 사람이 보고 적는다.'
      );
    }
  } else {
    errs.push(`virtualPerson 값이 true/false 가 아니다: ${JSON.stringify(decl)}`);
  }

  if (errs.length || warns.length) {
    console.log(`\n── ${f}`);
    for (const e of errs) { console.log(`   ⛔ ${e}`); blocked++; }
    for (const w of warns) { console.log(`   ⚠️ ${w}`); warned++; }
  }
}

// ── 재는 것 (막지 않는다) ──────────────────────────────────────
// ★ 「겹친 적이 0건」이라는 사실 자체가 매번 보여야 한다.
//   숫자가 0 에서 움직이는 순간이 우리가 알아야 할 순간이다.
console.log('');
console.log(`매니페스트 ${scanned}개 검사`);
console.log(`  경제적 이해관계만 ${광고만}건 · 가상인물 후보만 ${가상인물만}건 · **겹침 ${겹침}건**`);
if (겹침 === 0) {
  console.log('  ✅ 겹치는 게시물이 없다 — 다만 이건 계정이 갈려 있어서 생긴 우연이다.');
  console.log('     본계정 릴스에 제휴를 붙이면 그날 겹친다.');
}
if (!blocked && !warned) console.log('✅ 차단 사유 없음');
else console.log(`${blocked ? '⛔ 차단 ' + blocked + '건' : ''} ${warned ? '⚠️ 경고 ' + warned + '건' : ''}`.trim());
console.log('⛔ 이 게이트는 법률 판단을 하지 않는다 — 심사지침 적용 대상인지는 사람이 정한다.');

process.exit(blocked ? 1 : 0);
