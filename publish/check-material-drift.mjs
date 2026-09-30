// check-material-drift.mjs — 자료 배포 회차에서 **공개 리포가 낡았는지** 본다. 2026-09-10 신설 (사용자 지시).
//
// ── 왜 만들었나 ──────────────────────────────────────────────────────────────
// 2026-09-10 에 공개 리포 넷을 전수 대조했더니 **셋이 낡아 있었다.**
//   1호 instagram-threads-autopublish — 9/04 배포 후 계속 옛 lines-path
//   2호 blog-draft-tools             — 배포일 9/07 인데 **리포 마지막 커밋이 8/27**
//   4호 reels-assembly-tools         — 9/09 배포, 다음 날 이미 3파일 뒤쳐짐
// ★★★ 2호가 이 검사가 필요한 이유 그 자체다. 변경은 **9/02** 에 있었고 배포는 **9/07** 인데
//   내보내기를 안 해서 **그날 자료를 받은 사람은 그 변경이 없는 코드를 받았다.**
//   ⛔ 링크는 살아 있었고 리포도 돌았다 — **아무 신호가 없었다.** `check-blog-url` 은
//      「주소가 사나」를 묻지 「내용이 최신인가」를 안 묻는다. 그래서 다른 검사다.
//
// ── 무엇을 막나 ──────────────────────────────────────────────────────────────
// 「배포했다」와 「배포본이 최신이다」는 다르다. 후자만 본다.
//
// ⛔⛔ **날짜로 회차를 고르지 않는다.** `check-schedule.mjs` 는 `배포일` 로 슬롯에 라벨을
//   붙이는데, 그 날짜에는 07:00 AM 스레드도 09:00 토스도 같이 있다. 날짜로 걸면
//   **리포 드리프트 때문에 그날 아침 스레드가 안 나간다** — 게이트가 아니라 사고다.
// ▶ 그래서 **매니페스트가 스스로 선언한다**: `"material": "3호"`.
//   선언이 없으면 이 검사는 **아무것도 막지 않는다.**
// ⚠️ 대신 그 날짜에 배포 예정 자료가 있는데 아무 매니페스트도 선언을 안 했으면
//   **경고를 찍는다.** 「조용히 안 도는 검사」가 제일 나쁘다.
//
// ── 판정 규약 (check-blog-url 과 같은 계열) ──────────────────────────────────
//   드리프트 ≥ 1 파일  → **막는다** (확정 음성)
//   클론·내보내기·git 실패 → **경고하고 통과** (못 물어본 것과 없는 것은 다르다)
// 🔬 CRLF 로 갈리지 않는다 — `diff -rq` 는 14개 중 10개를 오탐했다. git 인덱스 정규화를 쓴다.
//
// 사용: node check-material-drift.mjs --only post-reels-graph.json
//       node check-material-drift.mjs --all        (선언된 회차 전부)

import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PIPELINE = join(HERE, '..');
const EXPORTER = join(PIPELINE, 'export-material.mjs');
const OWNER = 'dhenddl';

// ⛔ `fs.cpSync` 를 쓰지 않는다 — 2026-09-10 실측: node v22.21.1(Windows) 에서 클론 폴더
//    (`.git` 이 든 곳) 위로 재귀 복사하면 **세그폴트로 죽는다.** 예외도 없이 프로세스가 사라져
//    「게이트 실행 자체가 실패」로 찍혔다. 직접 걸어서 복사한다.
function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

const argv = process.argv.slice(2);
const oi = argv.indexOf('--only');
const only = oi >= 0 ? argv[oi + 1] : '';
const all = argv.includes('--all');

let mats = [];
try {
  mats = JSON.parse(readFileSync(join(PIPELINE, 'materials.json'), 'utf8')).materials ?? [];
} catch (e) {
  console.log(`⚠️ materials.json 을 못 읽었다 — 검사하지 않고 통과한다 (${e.message})`);
  process.exit(0);
}

const manifests = only
  ? [only]
  : readdirSync(HERE).filter((f) => f.startsWith('post-') && f.endsWith('.json'));

// ── 이 회차가 자료 배포 회차인가 ────────────────────────────────
const declared = [];        // [{ manifest, id }]
const dateOnly = [];        // 날짜만 맞고 선언이 없는 것
for (const f of manifests) {
  let m;
  try { m = JSON.parse(readFileSync(join(HERE, f), 'utf8')); } catch { continue; }
  if (m.material) { declared.push({ manifest: f, id: String(m.material) }); continue; }
  const d = m.publishDate;
  if (!d) continue;
  for (const mat of mats) if (mat['배포일'] === d) dateOnly.push({ manifest: f, id: mat.id, date: d });
}

for (const { manifest, id, date } of dateOnly) {
  console.log(`⚠️ ${manifest} 의 발행일(${date})이 자료 ${id} 배포일과 같은데 \`"material": "${id}"\` 선언이 없다.`);
  console.log('   ▶ 배포 회차라면 매니페스트에 그 키를 넣어라. 이 검사는 선언된 회차만 본다.');
}

if (!declared.length) {
  console.log(only ? `✅ ${only} — 자료 배포 회차가 아니다 (material 선언 없음)` : '✅ 선언된 자료 배포 회차 없음');
  process.exit(0);
}

const 막힘 = [];
for (const { manifest, id } of declared) {
  const mat = mats.find((m) => m.id === id);
  if (!mat) { console.log(`⚠️ ${manifest}: materials.json 에 자료 ${id} 가 없다 — 통과시킨다`); continue; }
  const repo = mat.repo;
  if (!repo) { console.log(`⚠️ 자료 ${id} 에 repo 가 없다 — 통과시킨다`); continue; }

  let tmp;
  try {
    tmp = mkdtempSync(join(tmpdir(), 'matdrift-'));
    const clone = join(tmp, 'repo');
    const exp = join(tmp, 'exp');

    // ⚠️ 여기부터 네트워크·외부 명령이다. 실패는 전부 「못 물어봤다」로 처리한다.
    // ★ `-c core.autocrlf=false` — 워킹트리를 LF 로 받는다. 내보내기도 LF 라 대조가 직접적이고,
    //   git 이 파일마다 「LF will be replaced by CRLF」 경고를 뱉지 않는다(16줄이 나왔다).
    execFileSync('git', ['-c', 'core.autocrlf=false', 'clone', '--quiet', '--depth', '1', `https://github.com/${OWNER}/${repo}.git`, clone],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 });
    execFileSync(process.execPath, [EXPORTER, id, '--out', exp],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 });
    copyTree(join(exp, id), clone);

    // ★ git 인덱스 정규화로 본다 — 파일 비교로 보면 CRLF 가 전부 다르다고 나온다.
    const changed = execFileSync('git', ['diff', '--name-only'], { cwd: clone, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n').map((s) => s.trim()).filter(Boolean);
    // ⛔⛔ 새 파일을 빼먹지 않는다 — `git add -u` 였으면 1호가 없는 파일을 부르는 채로 나갔다(2026-09-10).
    const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: clone, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n').map((s) => s.trim()).filter(Boolean);

    if (!changed.length && !added.length) {
      console.log(`✅ ${manifest} — 자료 ${id} (${repo}) 배포본이 최신이다`);
    } else {
      막힘.push({ manifest, id, repo, changed, added });
    }
  } catch (e) {
    const why = String(e.stderr || e.message || '').split('\n')[0].slice(0, 160);
    console.log(`⚠️ 자료 ${id} (${repo}) 를 대조하지 못했다 — **통과시킨다**: ${why}`);
    console.log('   ★ 「못 물어본 것」과 「없는 것」은 다르다. 순간 장애로 그날 회차를 막지 않는다.');
  } finally {
    if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 임시 폴더다 */ } }
  }
}

if (!막힘.length) process.exit(0);

console.log('');
console.log('⛔⛔ 자료 배포 회차인데 **공개 리포가 낡았다.**');
for (const { manifest, id, repo, changed, added } of 막힘) {
  console.log(`\n──── ${manifest} → 자료 ${id} · github.com/${OWNER}/${repo}`);
  for (const f of changed) console.log(`   M ${f}`);
  for (const f of added) console.log(`   + ${f}  ← 리포에 없는 새 파일`);
  console.log(`   ▶ 고치기: 임시 클론 후 \`node ../export-material.mjs ${id} --out <tmp>\` 로 덮고,`);
  console.log('     **새 파일까지 이름으로 지정해** 커밋·푸시한다 (git add -u 는 새 파일을 못 본다).');
}
console.log('');
console.log('📌 2026-09-07 에 자료 2호를 배포했는데 리포가 8/27 커밋이었다. 변경은 9/02 에 이미 있었고,');
console.log('   그날 자료를 받은 사람은 그 변경이 없는 코드를 받았다. 링크가 살아 있어 아무 신호가 없었다.');
process.exit(1);
