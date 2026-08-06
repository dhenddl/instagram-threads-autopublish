// make-reels.mjs — 카드뉴스 이미지(4:5)를 9:16 세로 릴스 영상으로 합성
// 오디오는 무음 트랙만 넣는다(호환용). 트렌드 음악은 인스타 앱에서 업로드 시 얹는다.
// 사용법:
//   node make-reels.mjs --dir out/day-0 --out out/day-0/day-0-reels.mp4
//   [--hold 4] 장당 노출초  [--xfade 0.5] 크로스페이드초  [--bg 0x0D1117] 레터박스 배경색
//   [--hook tip-2.json] ★ 첫 1초 키네틱 훅: 표지를 타이핑/슬라이드인으로 애니메이션한 인트로를
//     앞에 붙이고(정적 표지 대신), 이후 슬라이드(2번~)로 크로스페이드. 리텐션(첫 3초) 개선용.
//   [--fps 30] 프레임레이트
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tryWriteReelCaption, readPublishDate, drivePathFor } from './reel-caption.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = { dir: 'out/day-0', hold: 4.0, xfade: 0.5, out: null, bg: '0x0D1117', drive: null, rclone: 'rclone', hook: null, fps: 30, hookSpeed: 1.0, slug: null, manifest: null, pubdate: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dir') args.dir = argv[++i];
  else if (argv[i] === '--hold') args.hold = parseFloat(argv[++i]);
  else if (argv[i] === '--xfade') args.xfade = parseFloat(argv[++i]);
  else if (argv[i] === '--out') args.out = argv[++i];
  else if (argv[i] === '--bg') args.bg = argv[++i];
  else if (argv[i] === '--drive') args.drive = argv[++i];   // 예: gdrive:dhenddl-reels/
  else if (argv[i] === '--rclone') args.rclone = argv[++i];
  else if (argv[i] === '--hook') args.hook = argv[++i];      // 표지 애니 인트로용 slides.json
  else if (argv[i] === '--hook-speed') args.hookSpeed = parseFloat(argv[++i]); // 인트로 배속(>1=느리게)
  else if (argv[i] === '--fps') args.fps = parseInt(argv[++i], 10);
  else if (argv[i] === '--slug') args.slug = argv[++i];      // 캡션 자동탐지용(생략 시 --dir 폴더명)
  else if (argv[i] === '--manifest') args.manifest = argv[++i]; // 캡션 매니페스트 직접 지정
  else if (argv[i] === '--pubdate') args.pubdate = argv[++i];   // 드라이브 파일명 접두 발행일. 생략 시 매니페스트 publishDate
}

const W = 1080, H = 1920;
const srcDir = resolve(HERE, args.dir);
const allJpgs = readdirSync(srcDir).filter((f) => /^slide-\d+\.jpg$/.test(f)).sort();
if (!allJpgs.length) throw new Error(`${srcDir}에 slide-*.jpg 없음 (render.js 먼저 실행)`);
const out = args.out ? resolve(HERE, args.out) : join(srcDir, 'reels.mp4');
const FPS = args.fps;

// ---------- 정적 슬라이드쇼(레터박스+크로스페이드) 빌드 ----------
function buildSlideshow(jpgs, outPath, withAudio) {
  const n = jpgs.length, d = args.hold, x = args.xfade;
  const total = n === 1 ? d : n * d - (n - 1) * x;
  const inputs = [];
  for (const f of jpgs) inputs.push('-loop', '1', '-t', String(d), '-i', join(srcDir, f));
  if (withAudio) inputs.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${args.bg},setsar=1,fps=${FPS},format=yuv420p[v${i}]`);
  }
  let vlabel;
  if (n === 1) { vlabel = '[v0]'; }
  else {
    let prev = '[v0]';
    for (let k = 1; k < n; k++) {
      const off = (k * (d - x)).toFixed(3);
      const label = k === n - 1 ? '[vout]' : `[x${k}]`;
      parts.push(`${prev}[v${k}]xfade=transition=fade:duration=${x}:offset=${off}${label}`);
      prev = label;
    }
    vlabel = '[vout]';
  }
  const ffArgs = ['-y', ...inputs, '-filter_complex', parts.join(';'), '-map', vlabel];
  if (withAudio) ffArgs.push('-map', `${n}:a`);
  ffArgs.push('-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS));
  if (withAudio) ffArgs.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  ffArgs.push('-movflags', '+faststart', outPath);
  const r = spawnSync(ffmpegPath, ffArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error('ffmpeg(슬라이드쇼) 실패'); process.exit(r.status ?? 1); }
  return total;
}

// ---------- 표지 키네틱 인트로 프레임 렌더(Playwright) ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function renderIntro(coverJson, framesDir, speed) {
  const { meta, slides } = coverJson;
  const cover = slides[0];
  const N = slides.length;
  const lines = String(cover.title).split('\n');
  const lineSpans = lines.map((ln, i) => {
    const cur = i === lines.length - 1 ? '<span class="cursor" id="cursor"></span>' : '';
    return `<span class="tline" data-i="${i}">${esc(ln)}${cur}</span>`;
  }).join('');
  // 타임라인(ms) — Node/브라우저 공유. speed>1 = 전체 느리게(기본 1.0)
  const SP = speed || 1.0;
  const REVEAL_START = Math.round(420 * SP), LINE_STEP = Math.round(260 * SP), LINE_DUR = Math.round(430 * SP);
  const ZOOM_MS = Math.round(1550 * SP), HOLD = Math.round(800 * SP);
  const lastRevealEnd = REVEAL_START + (lines.length - 1) * LINE_STEP + LINE_DUR;
  const subS = lastRevealEnd + Math.round(80 * SP);
  const INTRO_MS = subS + Math.round(300 * SP) + HOLD; // sub 등장 + 마무리 홀드
  const pgW = ((1 / N) * 100).toFixed(1);

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
:root{--bg:#0d1117;--panel:#161b22;--line:#30363d;--text:#e6edf3;--dim:#9aa4b2;--accent:#3fb950;--accent-dim:#238636;}
html,body{width:${W}px;height:${H}px;background:#0d1117;overflow:hidden;}
body{font-family:'Pretendard Variable',Pretendard,'Noto Sans KR','Malgun Gothic',sans-serif;}
.stage{width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;background:#0d1117;}
.mono{font-family:'Cascadia Code','D2Coding',Consolas,monospace;}
.card{width:1080px;height:1350px;background:var(--bg);color:var(--text);position:relative;overflow:hidden;display:flex;flex-direction:column;transform-origin:center;will-change:transform;}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(63,185,80,.13) 0%,transparent 62%);top:-320px;right:-280px;pointer-events:none;}
.chrome{display:flex;align-items:center;gap:14px;padding:34px 56px;border-bottom:1px solid var(--line);background:var(--panel);}
.dot{width:22px;height:22px;border-radius:50%;}
.chrome .t{margin-left:14px;font-size:26px;color:var(--dim);}
.chrome .pg{margin-left:auto;font-size:26px;color:var(--dim);letter-spacing:2px;}
.inner{flex:1;display:flex;flex-direction:column;padding:88px 92px 72px;position:relative;}
.badge{align-self:flex-start;font-size:28px;color:var(--accent);border:2px solid var(--accent-dim);border-radius:999px;padding:14px 30px;margin-bottom:56px;letter-spacing:1px;opacity:0;}
h1{font-size:96px;line-height:1.22;font-weight:800;letter-spacing:-1px;}
.tline{display:block;opacity:0;will-change:transform,opacity;}
.sub{margin-top:44px;font-size:40px;color:var(--dim);line-height:1.5;opacity:0;}
.cursor{display:inline-block;width:20px;height:66px;background:var(--accent);margin-left:12px;vertical-align:-8px;}
.footer{margin-top:auto;}
.next{display:flex;align-items:center;gap:18px;font-size:32px;color:var(--dim);}
.next::before{content:">";color:var(--accent);font-weight:700;}
.next::after{content:"→";color:var(--accent);margin-left:6px;}
.bar{margin-top:34px;height:8px;background:var(--line);border-radius:4px;overflow:hidden;}
.bar i{display:block;height:100%;background:var(--accent);width:${pgW}%;}
</style></head><body>
<div class="stage"><div class="card" id="card">
  <div class="glow"></div>
  <div class="chrome">
    <span class="dot" style="background:#ff5f56"></span>
    <span class="dot" style="background:#ffbd2e"></span>
    <span class="dot" style="background:#27c93f"></span>
    <span class="t mono">${esc(meta.terminalTitle)}</span>
    <span class="pg mono">01 / ${String(N).padStart(2, '0')}</span>
  </div>
  <div class="inner">
    <div class="badge mono" id="badge">${esc(cover.badge ?? '')}</div>
    <h1 id="title">${lineSpans}</h1>
    <div class="sub" id="sub">${esc(cover.sub ?? '')}</div>
    <div class="footer">
      ${cover.next ? `<div class="next mono">${esc(cover.next)}</div>` : ''}
      <div class="bar"><i></i></div>
    </div>
  </div>
</div></div>
<script>
const REVEAL_START=${REVEAL_START}, LINE_STEP=${LINE_STEP}, LINE_DUR=${LINE_DUR}, SUB_S=${subS}, ZOOM_MS=${ZOOM_MS};
window.frame=(t)=>{
  const z = t<ZOOM_MS ? (1.05 - 0.05*(t/ZOOM_MS)) : 1.0;         // 미세 줌 세틀
  document.getElementById('card').style.transform='scale('+z+')';
  const badge=document.getElementById('badge');
  const bp=Math.max(0,Math.min(1,t/300));
  badge.style.opacity=bp; badge.style.transform='translateY('+((1-bp)*20)+'px)';
  document.querySelectorAll('.tline').forEach((el,i)=>{
    const s=REVEAL_START+i*LINE_STEP;
    const p=Math.max(0,Math.min(1,(t-s)/LINE_DUR));
    el.style.opacity=p; el.style.transform='translateY('+((1-p)*46)+'px)';
  });
  const sp=Math.max(0,Math.min(1,(t-SUB_S)/300));
  const sub=document.getElementById('sub');
  sub.style.opacity=sp; sub.style.transform='translateY('+((1-sp)*24)+'px)';
  const cur=document.getElementById('cursor');
  if(cur) cur.style.visibility=(Math.floor(t/500)%2===0)?'visible':'hidden';
};
window.frame(0);
</script></body></html>`;

  mkdirSync(framesDir, { recursive: true });
  const nFrames = Math.ceil((INTRO_MS / 1000) * FPS);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  for (let f = 0; f < nFrames; f++) {
    await page.evaluate((tt) => window.frame(tt), (f / FPS) * 1000);
    await page.screenshot({ path: join(framesDir, `f-${String(f).padStart(5, '0')}.png`) });
  }
  await browser.close();
  return nFrames / FPS; // intro duration(sec)
}

function encodeFrames(framesDir, outPath) {
  const r = spawnSync(ffmpegPath, ['-y', '-framerate', String(FPS), '-i', join(framesDir, 'f-%05d.png'),
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', outPath],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error('ffmpeg(인트로 인코딩) 실패'); process.exit(r.status ?? 1); }
}

// ---------- 메인 ----------
if (args.hook) {
  const coverJson = JSON.parse(readFileSync(resolve(HERE, args.hook), 'utf8'));
  console.log(`키네틱 훅 인트로 렌더: 표지 애니메이션 (${args.hook})`);
  const introFrames = join(srcDir, '_intro-frames');
  if (existsSync(introFrames)) rmSync(introFrames, { recursive: true, force: true });
  const introDur = await renderIntro(coverJson, introFrames, args.hookSpeed);
  const introMp4 = join(srcDir, '_intro.mp4');
  encodeFrames(introFrames, introMp4);

  const bodyJpgs = allJpgs.slice(1); // 표지(slide-01)는 애니 인트로가 대체
  if (!bodyJpgs.length) throw new Error('본문 슬라이드가 없음(표지 1장뿐) — --hook 불필요');
  const bodyMp4 = join(srcDir, '_body.mp4');
  const bodyDur = buildSlideshow(bodyJpgs, bodyMp4, false);

  // 인트로 → 본문 크로스페이드 결합 + 무음 오디오
  const XF = args.xfade;
  const offset = Math.max(0.1, introDur - XF).toFixed(3);
  const total = (introDur + bodyDur - XF).toFixed(3);
  console.log(`결합: 인트로 ${introDur.toFixed(1)}s + 본문 ${bodyDur.toFixed(1)}s (xfade ${XF}s) → 총 ~${total}s`);
  const r = spawnSync(ffmpegPath, ['-y', '-i', introMp4, '-i', bodyMp4,
    '-f', 'lavfi', '-t', total, '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', `[0:v][1:v]xfade=transition=fade:duration=${XF}:offset=${offset},format=yuv420p[v]`,
    '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error('ffmpeg(결합) 실패'); process.exit(r.status ?? 1); }
  rmSync(introFrames, { recursive: true, force: true });
  rmSync(introMp4, { force: true });
  rmSync(bodyMp4, { force: true });
  console.log(`완료(키네틱 훅): ${out}`);
} else {
  const n = allJpgs.length;
  console.log(`합성: ${n}장 → ${out} (장당 ${args.hold}s · 크로스페이드 ${args.xfade}s · ${W}x${H} · 무음)`);
  buildSlideshow(allJpgs, out, true);
  console.log(`완료: ${out}`);
}

// ---------- 릴스 캡션 자동 생성 (post-<슬러그>.json → out과 같은 폴더에 -caption.txt) ----------
const captionOut = tryWriteReelCaption({ slug: args.slug || basename(srcDir), manifestOverride: args.manifest, videoOutPath: out });

// ---------- 구글 드라이브 자동 업로드 (rclone) — 영상 + 캡션.txt 함께 (원격 업로드 대비) ----------
// rclone copy는 소스 1개만 받으므로 파일별로 반복 호출
if (args.drive) {
  // ⚠️ 설정 파일 위치가 중요하다 (2026-08-04): %APPDATA%의 rclone.conf는 클로드 세션과 사용자 터미널이
  // 서로 다른 사본을 보게 되는 문제가 있었다(토큰 갱신 시 쓰기가 갈라짐 → invalid_grant).
  // 그래서 이 폴더의 rclone.conf(양쪽 공유 영역)를 있으면 무조건 우선 사용한다.
  const localConf = join(HERE, 'rclone.conf');
  const confArgs = existsSync(localConf) ? ['--config', localConf] : [];

  // 발행일 없이는 업로드하지 않는다 — 상세 이유는 make-termcast.mjs의 같은 블록 주석 참고.
  const pubDate = readPublishDate({ slug: args.slug || basename(srcDir), manifestOverride: args.manifest, override: args.pubdate });
  if (!pubDate) {
    console.error('❌ 발행일을 못 찾아 드라이브 업로드를 중단했습니다 (영상·캡션은 로컬에 그대로 있습니다).');
    console.error('   드라이브 파일명은 "<발행일>-<슬러그>-reels.mp4" 규칙입니다. 둘 중 하나로 알려주세요:');
    console.error(`   ① 매니페스트에 "publishDate": "YYYY-MM-DD" 추가 (권장 — 발행일이 콘텐츠와 같은 곳에 남는다)`);
    console.error('   ② 이 명령에 --pubdate YYYY-MM-DD 추가');
    process.exit(1);
  }

  const toUpload = [out, ...(captionOut ? [captionOut] : [])];
  for (const f of toUpload) {
    // copy(폴더로 복사, 원래 이름 유지)가 아니라 copyto(대상 파일명 지정)를 쓴다 — 이름을 바꿔 올리려면 필수.
    const dest = drivePathFor(args.drive, f, pubDate);
    console.log(`드라이브 업로드: ${f} → ${dest}`);
    const up = spawnSync(args.rclone, [...confArgs, 'copyto', f, dest, '--stats-one-line'], { stdio: ['ignore', 'inherit', 'inherit'] });
    if (up.status !== 0) { console.error(`rclone 업로드 실패(${f}) — rclone 경로/설정(gdrive 원격) 확인`); process.exit(up.status ?? 1); }
  }
  console.log(`드라이브 업로드 완료 — 발행일 ${pubDate} 접두 (폰 드라이브 앱에서 확인)`);
}
