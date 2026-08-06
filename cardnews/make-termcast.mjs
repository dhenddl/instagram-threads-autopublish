// make-termcast.mjs — publish.mjs 실행 장면을 세로 릴스(터미널 스크린캐스트)로 렌더
// 방식 A(구축기 컨셉): 명령어 타이핑(1초 훅) → 실제 발행 출력 줄 순차 표출 → 발행 완료.
// 프레임은 Playwright로 결정론적 캡처(시간 t로 구동) → ffmpeg-static으로 1080x1920 무음 MP4.
// make-reels.mjs의 ffmpeg + --drive(rclone) 업로드 패턴 재사용. 트렌드 음악은 폰 업로드 시 얹는다.
//
// 사용법:
//   node make-termcast.mjs --lines out/day-2/publish-output.txt \
//     --cmd "node publish.mjs --manifest post-day-2.json" \
//     --title "day-2.sh — 무인 수익 실험" \
//     --out out/day-2/day-2-reels.mp4 [--drive gdrive:dhenddl-reels/]
//   실시간 캡처: --run "node ../publish/publish.mjs --manifest ../publish/post-day-2.json --dry-run"
//     (--run 은 명령을 실제 실행해 stdout 을 캡처 — API 를 호출하므로 재렌더 시엔 --lines 권장)
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tryWriteReelCaption, readPublishDate, drivePathFor } from './reel-caption.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = {
  lines: null, run: null, cmd: 'node publish.mjs', title: 'publish.sh',
  out: null, fps: 24, drive: null, rclone: 'rclone', keepFrames: false, slug: null, manifest: null, pubdate: null, loop: false,
  hookText: null, hookSub: null, hookBadge: null, hookMs: 1600,
  outro: '🚀 인스타 + 스레드 동시 발행 완료',   // 마지막 성공 줄. 발행 외 명령(예: check-insights)엔 --outro로 교체
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--lines') args.lines = argv[++i];
  else if (a === '--run') args.run = argv[++i];
  else if (a === '--cmd') args.cmd = argv[++i];
  else if (a === '--title') args.title = argv[++i];
  else if (a === '--out') args.out = argv[++i];
  else if (a === '--fps') args.fps = parseInt(argv[++i], 10);
  else if (a === '--drive') args.drive = argv[++i];
  else if (a === '--rclone') args.rclone = argv[++i];
  else if (a === '--keep-frames') args.keepFrames = true;
  else if (a === '--slug') args.slug = argv[++i];       // 캡션 자동탐지용(생략 시 --out 폴더명)
  else if (a === '--manifest') args.manifest = argv[++i]; // 캡션 매니페스트 직접 지정
  else if (a === '--outro') args.outro = argv[++i];       // 마지막 성공 줄 교체(발행 외 명령용)
  else if (a === '--pubdate') args.pubdate = argv[++i];   // 드라이브 파일명 접두 발행일. 생략 시 매니페스트 publishDate
  else if (a === '--loop') args.loop = true;              // 끝→처음 이어지는 루프 설계(조회/도달 비율 실험용)
  else if (a === '--hook-text') args.hookText = argv[++i]; // ★ 0초에 띄우는 큰 글씨 결론(\n=줄바꿈)
  else if (a === '--hook-sub') args.hookSub = argv[++i];   // 훅 아래 보조 문장
  else if (a === '--hook-badge') args.hookBadge = argv[++i];
  else if (a === '--hook-ms') args.hookMs = parseInt(argv[++i], 10);
}
if (!args.out) throw new Error('--out <mp4> 필요');

// ---- 출력 줄 확보 (실제 publish.mjs 출력) ----
let raw;
if (args.run) {
  console.log(`캡처 실행: ${args.run}`);
  const parts = args.run.split(' ').filter(Boolean);
  const r = spawnSync(parts[0], parts.slice(1), { cwd: HERE, encoding: 'utf8' });
  raw = r.stdout || '';
  if (r.status !== 0) console.warn('⚠️ 캡처 명령 비정상 종료 — 캡처된 출력 일부만 사용');
} else if (args.lines) {
  raw = readFileSync(resolve(HERE, args.lines), 'utf8');
} else {
  throw new Error('--lines <file> 또는 --run "<cmd>" 중 하나 필요');
}

// 세로 모바일 가독을 위해 컨테이너 ID·dry-run 안내를 정리
const tidy = (l) => l
  .replace(/\s*\(\d{6,}\)/g, '')             // "@dhenddl1 (3714...)" → "@dhenddl1"
  .replace(/:\s*\d{6,}/g, ' ✓')              // "...: 18068..." → " ✓" (컨테이너 ID 제거)
  .replace(/\s*컨테이너/g, '')                // 터미널 용어 정리(세로 모바일 가독)
  .replace(/\s{2,}/g, ' ')
  .trim();
const outLines = raw.split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((l) => !/dry-run|발행 직전 정지|검수/.test(l))   // dry-run 안내 제거
  .map(tidy);
if (args.outro) outLines.push(args.outro);                 // 마지막 성공 줄(기본=실제 발행 결과)

// ---- 타임라인 (ms, 결정론적) ----
// 타이핑 속도. 훅 프레임이 없을 때는 타이핑 자체가 훅이라 천천히(30자/초 = 1초 훅) 보여줬다.
// ★ 훅 프레임이 있으면 타이핑은 훅이 아니라 **전환 구간**이다 — 결론은 이미 0초에 전달됐으므로
//   여기서 시간을 쓰면 3초 이탈 구간 안에 "명령어만 치는 빈 화면"이 남는다 → 2배로 넘긴다.
const CPS = args.hookText ? 60 : 30;
const typeDur = (args.cmd.length / CPS) * 1000;
const ENTER_PAUSE = args.hookText ? 220 : 350;
const LINE_STEP = 470;                                     // 줄당 등장 간격
const END_HOLD = 2400;

// ★★★ 훅 프레임 (2026-08-06 신설) — 0초에 결론을 전달한다.
//
// 왜: `reels_skip_rate` 실측이 8건 전부 **69~84%가 첫 3초에 이탈**이었고, 코드 타임라인을 대조하니
//     원인이 우리 구조였다 — 첫 3초는 "명령어를 타이핑하는 셋업"이고 결론 줄은 6.3초에 등장한다.
//     originality 릴스 평균 시청이 2.64초였으므로 **평균 시청자는 결론을 본 적이 없다**(도달률 42%).
//
// ⚠️ 그래서 "훅 프레임을 앞에 덧붙이는" 방식은 틀렸다 — 페이오프가 오히려 더 늦어진다.
//    훅 텍스트 자체가 **결론**이어야 하고, 터미널은 셋업이 아니라 **증거**로 뒤에 온다.
//    → 페이오프 시점 6.3초 → **0초**.
const HOOK_MS = args.hookText ? Math.max(0, args.hookMs) : 0;
const START_OUT = HOOK_MS + typeDur + ENTER_PAUSE;

// --loop: 마지막 구간에서 화면을 첫 프레임 상태(빈 프롬프트 + 커서)로 되돌려 이어붙임이 안 보이게 한다.
// 근거: 우리 릴스는 이미 조회/도달 1.08~1.43배로 반복 재생이 일어나고 있고(팁2는 완주율 174%),
//       루프 설계는 그 현상을 증폭하는 방향이다 → summaries/플랫폼-알고리즘/릴스 알고리즘 공략집 2026.
// ⚠️ 기본값 off — 켜면 포맷이 바뀌어 기존 릴스와의 실측 비교가 깨진다. 관찰 지표는 조회/도달 비율.
const LOOP_MS = args.loop ? 800 : 0;
const LOOP_START = START_OUT + outLines.length * LINE_STEP + END_HOLD;
const totalMs = Math.ceil(LOOP_START + LOOP_MS);

// ---- HTML ----
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lineHTML = (l) => {
  let h = esc(l);
  h = h.replace(/✓/g, '<span class="ok">✓</span>');
  h = h.replace(/^(\[IG\]|\[TH\])/, '<span class="tag">$1</span>');
  if (l.startsWith('🚀') || l.startsWith('✅')) h = `<span class="success">${esc(l)}</span>`;
  return `<div class="ln">${h}</div>`;
};
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
:root { --bg:#0d1117; --panel:#161b22; --line:#30363d; --text:#e6edf3; --dim:#9aa4b2; --accent:#3fb950; }
html,body { width:1080px; height:1920px; background:var(--bg); overflow:hidden; }
body { font-family:'Cascadia Code','D2Coding',Consolas,monospace; color:var(--text); }
.chrome { display:flex; align-items:center; gap:16px; padding:44px 60px; border-bottom:1px solid var(--line); background:var(--panel); }
.dot { width:26px; height:26px; border-radius:50%; }
.chrome .t { margin-left:16px; font-size:38px; color:var(--dim); }
.term { padding:70px 64px; font-size:36px; line-height:1.64; }
.cmdline { color:var(--text); white-space:pre-wrap; word-break:keep-all; overflow-wrap:break-word; }
.prompt { color:var(--accent); font-weight:700; margin-right:14px; }
#cursor { display:inline-block; width:20px; height:46px; background:var(--accent); vertical-align:-6px; margin-left:4px; }
#out { margin-top:40px; }
.ln { opacity:0; transition:opacity .18s ease; margin:10px 0; white-space:pre-wrap; word-break:keep-all; overflow-wrap:break-word; }
.ln .tag { color:var(--dim); }
.ln .ok { color:var(--accent); font-weight:700; }
.ln .success { color:var(--accent); font-weight:800; }
.cta { position:absolute; left:0; right:0; bottom:0; opacity:0; transition:opacity .3s ease;
  display:flex; gap:24px; justify-content:center; align-items:center;
  padding:48px 40px 60px; background:linear-gradient(transparent, rgba(13,17,23,.9) 30%); }
.pill { font-size:40px; font-weight:800; padding:26px 40px; border-radius:16px; }
.pill.save { background:var(--accent); color:#04260f; }
.pill.follow { border:2px solid var(--accent); color:var(--accent); }
/* 훅 프레임 — 터미널이 아니라 카드 톤(산세리프 큰 글씨)이어야 스크롤 중에 읽힌다 */
.hook { position:absolute; inset:0; background:var(--bg); z-index:5;
  display:flex; flex-direction:column; justify-content:center; padding:0 88px;
  font-family:'Pretendard Variable',Pretendard,'Noto Sans KR','Malgun Gothic',sans-serif; }
.hook .hb { align-self:flex-start; margin-bottom:56px; font-size:36px; color:var(--accent);
  border:2px solid #238636; border-radius:999px; padding:18px 38px; letter-spacing:1px; }
.hook .ht { font-size:112px; line-height:1.2; font-weight:800; letter-spacing:-3px;
  word-break:keep-all; overflow-wrap:break-word; }
.hook .hs { margin-top:52px; font-size:50px; line-height:1.42; color:var(--dim);
  word-break:keep-all; overflow-wrap:break-word; }
.hook .hglow { position:absolute; width:1100px; height:1100px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, rgba(63,185,80,.16) 0%, transparent 62%); top:-360px; right:-320px; }
</style></head><body>
<div class="chrome">
  <span class="dot" style="background:#ff5f56"></span>
  <span class="dot" style="background:#ffbd2e"></span>
  <span class="dot" style="background:#27c93f"></span>
  <span class="t">${esc(args.title)}</span>
</div>
<div class="term">
  <div class="cmdline"><span class="prompt">$</span><span id="cmd"></span><span id="cursor"></span></div>
  <div id="out">${outLines.map(lineHTML).join('')}</div>
</div>
<div class="cta" id="cta">
  <span class="pill save">📌 저장</span>
  <span class="pill follow">▶ 팔로우하고 다음 편</span>
</div>
${args.hookText ? `<div class="hook" id="hook"><div class="hglow"></div>
  ${args.hookBadge ? `<div class="hb">${esc(args.hookBadge)}</div>` : ''}
  <div class="ht">${esc(args.hookText).replace(/\\n/g, '<br>')}</div>
  ${args.hookSub ? `<div class="hs">${esc(args.hookSub).replace(/\\n/g, '<br>')}</div>` : ''}
</div>` : ''}
<script>
const CMD = ${JSON.stringify(args.cmd)};
const CPS = ${CPS}, START_OUT = ${START_OUT}, STEP = ${LINE_STEP}, NLINES = ${outLines.length};
const LOOP = ${args.loop ? 'true' : 'false'}, LOOP_START = ${LOOP_START};
const HOOK_MS = ${HOOK_MS};
window.frame = (t) => {
  // 루프 구간에서는 전부 초기 상태로 되돌린다 → 마지막 프레임 ≈ t=0 프레임이 되어 이어붙임이 안 보인다
  const looping = LOOP && t >= LOOP_START;
  // 훅은 0~HOOK_MS 구간, 그리고 루프 구간(=t=0 상태 재현)에 보인다
  const hook = document.getElementById('hook');
  const onHook = HOOK_MS > 0 && (looping || t < HOOK_MS);
  if (hook) hook.style.display = onHook ? 'flex' : 'none';

  const typed = looping ? 0 : Math.max(0, Math.min(CMD.length, Math.round((t - HOOK_MS)/1000*CPS)));
  document.getElementById('cmd').textContent = CMD.slice(0, Math.max(0, typed));
  const shown = looping ? 0 : (t < START_OUT ? 0 : Math.min(NLINES, Math.floor((t - START_OUT)/STEP) + 1));
  const kids = document.getElementById('out').children;
  for (let i = 0; i < kids.length; i++) kids[i].style.opacity = i < shown ? '1' : '0';
  const cur = document.getElementById('cursor');
  cur.style.display = (!looping && shown >= NLINES) ? 'none' : 'inline-block';
  cur.style.visibility = (Math.floor(t/500) % 2 === 0) ? 'visible' : 'hidden';
  // ★ CTA는 마지막 줄(결론)이 나온 뒤에만 띄운다 — 종전엔 1.4초에 떠서
  //   가치를 전달하기 전에 "팔로우하세요"가 먼저 나왔고, 그게 3초 이탈 구간 안이었다.
  document.getElementById('cta').style.opacity = (!looping && !onHook && shown >= NLINES) ? '1' : '0';
};
window.frame(0);
</script></body></html>`;

// ---- 프레임 캡처 ----
const W = 1080, H = 1920;
const outAbs = resolve(HERE, args.out);
// ⚠️ 프레임 폴더 재사용은 윈도우에서 두 번 죽었다 (2026-08-05·08-06):
//    `--keep-frames`로 남긴 PNG를 무엇이든 한 번 열어보면(뷰어·이미지 도구·탐색기 미리보기)
//    폴더가 비어 있어도 **핸들이 남아 rmdir이 EBUSY로 실패**하고, 렌더 전체가 그 자리에서 죽는다.
//    영상 생성과 아무 상관 없는 정리 작업 때문에 죽는 게 말이 안 되므로 → 지우지 못하면 **비켜간다.**
let framesDir = join(dirname(outAbs), 'termcast-frames');
if (existsSync(framesDir)) {
  try {
    rmSync(framesDir, { recursive: true, force: true });
  } catch (e) {
    framesDir = join(dirname(outAbs), `termcast-frames-${process.pid}`);
    console.warn(`⚠️ 기존 프레임 폴더를 지울 수 없어(${e.code}) 새 폴더를 쓴다: ${basename(framesDir)}`);
    console.warn('   (원인: 그 폴더의 PNG를 열어본 프로세스가 핸들을 잡고 있음. 렌더에는 영향 없음)');
  }
}
mkdirSync(framesDir, { recursive: true });

const nFrames = Math.ceil((totalMs / 1000) * args.fps);
console.log(`렌더: ${outLines.length}줄 · ~${(totalMs/1000).toFixed(1)}s · ${args.fps}fps · ${nFrames}프레임 · ${W}x${H}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
for (let f = 0; f < nFrames; f++) {
  const t = (f / args.fps) * 1000;
  await page.evaluate((tt) => window.frame(tt), t);
  const name = `f-${String(f).padStart(5, '0')}.png`;
  await page.screenshot({ path: join(framesDir, name) });
}
await browser.close();
console.log(`프레임 ${nFrames}장 캡처 완료`);

// ---- ffmpeg: 이미지 시퀀스 → MP4 (무음 트랙 포함) ----
const durSec = (nFrames / args.fps).toFixed(3);
const ffArgs = [
  '-y',
  '-framerate', String(args.fps), '-i', join(framesDir, 'f-%05d.png'),
  '-f', 'lavfi', '-t', durSec, '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(args.fps),
  '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
  outAbs,
];
console.log(`합성: → ${outAbs}`);
const r = spawnSync(ffmpegPath, ffArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
if (r.status !== 0) { console.error('ffmpeg 실패'); process.exit(r.status ?? 1); }
if (!args.keepFrames) rmSync(framesDir, { recursive: true, force: true });
console.log(`완료: ${outAbs}`);

// ---- 릴스 캡션 자동 생성 (post-<슬러그>.json → out과 같은 폴더에 -caption.txt) ----
const captionOut = tryWriteReelCaption({ slug: args.slug || basename(dirname(outAbs)), manifestOverride: args.manifest, videoOutPath: outAbs });

// ---- 구글 드라이브 자동 업로드 (rclone) — 영상 + 캡션.txt 함께 (원격 업로드 대비) ----
// rclone copy는 소스 1개만 받으므로 파일별로 반복 호출
if (args.drive) {
  // ⚠️ 설정 파일 위치가 중요하다 (2026-08-04): %APPDATA%의 rclone.conf는 클로드 세션과 사용자 터미널이
  // 서로 다른 사본을 보게 되는 문제가 있었다(토큰 갱신 시 쓰기가 갈라짐 → invalid_grant).
  // 그래서 이 폴더의 rclone.conf(양쪽 공유 영역)를 있으면 무조건 우선 사용한다.
  const localConf = join(HERE, 'rclone.conf');
  const confArgs = existsSync(localConf) ? ['--config', localConf] : [];

  // 발행일 없이는 업로드하지 않는다 — 날짜 없는 이름이 쌓이는 게 정확히 지금 고치는 문제다.
  // 경고로 두면 무시된다(어제 얻은 교훈: 사람 절차로 남긴 안전장치는 재발을 막지 못한다) → 하드 실패.
  const pubDate = readPublishDate({ slug: args.slug || basename(dirname(outAbs)), manifestOverride: args.manifest, override: args.pubdate });
  if (!pubDate) {
    console.error('❌ 발행일을 못 찾아 드라이브 업로드를 중단했습니다 (영상·캡션은 로컬에 그대로 있습니다).');
    console.error('   드라이브 파일명은 "<발행일>-<슬러그>-reels.mp4" 규칙입니다. 둘 중 하나로 알려주세요:');
    console.error(`   ① 매니페스트에 "publishDate": "YYYY-MM-DD" 추가 (권장 — 발행일이 콘텐츠와 같은 곳에 남는다)`);
    console.error('   ② 이 명령에 --pubdate YYYY-MM-DD 추가');
    process.exit(1);
  }

  const toUpload = [outAbs, ...(captionOut ? [captionOut] : [])];
  for (const f of toUpload) {
    // copy(폴더로 복사, 원래 이름 유지)가 아니라 copyto(대상 파일명 지정)를 쓴다 — 이름을 바꿔 올리려면 필수.
    const dest = drivePathFor(args.drive, f, pubDate);
    console.log(`드라이브 업로드: ${f} → ${dest}`);
    const up = spawnSync(args.rclone, [...confArgs, 'copyto', f, dest, '--stats-one-line'], { stdio: ['ignore', 'inherit', 'inherit'] });
    if (up.status !== 0) { console.error(`rclone 업로드 실패(${f}) — rclone 경로/설정(gdrive 원격) 확인`); process.exit(up.status ?? 1); }
  }
  console.log(`드라이브 업로드 완료 — 발행일 ${pubDate} 접두 (폰 드라이브 앱에서 확인)`);
}
