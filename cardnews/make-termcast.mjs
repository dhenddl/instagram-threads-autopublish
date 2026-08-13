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
//   ★ 색을 바꾼 시리즈면 --palette-from <같은 소재의 slides.json> 을 반드시 같이 준다.
//     안 주면 릴스만 기본 초록으로 나가서 캐러셀과 어긋난다.
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tryWriteReelCaption, readPublishDate, drivePathFor } from './reel-caption.mjs';
import { loadTheme, rgba } from './palette.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = {
  lines: null, run: null, cmd: 'node publish.mjs', title: 'publish.sh',
  out: null, fps: 24, drive: null, rclone: 'rclone', keepFrames: false, slug: null, manifest: null, pubdate: null, loop: false,
  hookText: null, hookSub: null, hookBadge: null, hookMs: 1600, paletteFrom: null,
  outro: '🚀 인스타 + 스레드 동시 발행 완료',   // 마지막 성공 줄. 발행 외 명령(예: check-insights)엔 --outro로 교체
  // ★ 2026-08-11 신설 — 캐릭터 + AI 음성 (8/14 포맷 실험용). 셋 다 기본 off.
  //   ⚠️ 안 주면 지금까지 나간 릴스와 **바이트 단위로 동일**하게 나온다(회귀 검증 완료).
  character: null, narrate: null, voice: 'ko-KR-InJoonNeural', voiceGap: 250,
  voiceRate: '+0%',      // edge-tts --rate. "+20%"면 20% 빠르게 읽는다
  charH: null,           // 캐릭터 높이(px). 생략 시 자막 있으면 700, 없으면 520(README 실측값)
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
  // ★ 같은 소재의 캐러셀 slides.json을 가리킨다 — 캐러셀과 릴스 색이 어긋나지 않게.
  //   생략하면 palette.mjs 기본값(=지금까지 발행한 색)을 쓴다.
  else if (a === '--palette-from') args.paletteFrom = argv[++i];
  // ★ 캐릭터 + 음성 (2026-08-11)
  else if (a === '--character') args.character = argv[++i];   // 누끼 PNG. assets/characters/*-cutout.png
  else if (a === '--narrate') args.narrate = argv[++i];        // 내레이션 대본(한 줄 = 한 문장)
  else if (a === '--voice') args.voice = argv[++i];            // edge-tts 음성명
  else if (a === '--voice-gap') args.voiceGap = parseInt(argv[++i], 10); // 문장 사이 무음(ms)
  else if (a === '--voice-rate') args.voiceRate = argv[++i];             // 읽는 속도 "+20%" 등
  else if (a === '--character-height') args.charH = parseInt(argv[++i], 10);
}
if (!args.out) throw new Error('--out <mp4> 필요');

// ---- 색·폰트 (palette.mjs가 단일 출처) ----
let themeMeta = {};
if (args.paletteFrom) {
  const p = resolve(HERE, args.paletteFrom);
  if (!existsSync(p)) throw new Error(`--palette-from 파일이 없다: ${p}`);
  themeMeta = JSON.parse(readFileSync(p, 'utf8')).meta ?? {};
  console.log(`팔레트 출처: ${basename(p)}${themeMeta.palette ? '' : ' (meta.palette 없음 → 기본값)'}`);
}
const { palette: pal, fonts } = loadTheme(themeMeta);

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

// ---- ★★ AI 음성 내레이션 (2026-08-11 신설) ----
//
// ⚠️ **여기가 이 기능의 어려운 자리다.** 캐릭터를 얹는 건 <img> 한 장이지만, 음성은 **길이가 대본에 따라
//    달라진다** — 지금까지 릴스는 `LINE_STEP = 470ms`로 고정이라 10초에 11줄이 떴다. 음성으로 읽으면
//    같은 내용이 20초가 넘는다. 그래서 **음성이 타임라인의 주인이 되고 줄이 거기 맞춰 분배**된다.
//
// 설계: 대본 전체를 edge-tts에 한 번에 넘긴다(문장 사이 쉼은 구두점으로 자연히 생긴다).
//       총 길이를 재서 `LINE_STEP = 총길이 ÷ 줄수`로 나눈다. 줄 수가 대본 문장 수와 달라도 된다.
// ⚠️ 1:1 매칭(대본 한 줄 = 출력 한 줄)은 일부러 안 했다 — 터미널 출력에는
//    `[IG] 아이템 3/7 컨테이너: 18075...` 같은 **읽을 수 없는 줄**이 섞인다.
function probeMs(file) {
  // ffprobe를 따로 안 쓴다 — ffmpeg-static만 있으면 되게 stderr의 Duration을 읽는다.
  const r = spawnSync(ffmpegPath, ['-i', file], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (!m) throw new Error(`오디오 길이를 못 읽었다: ${file}`);
  return Math.round((+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000);
}

let narrationMs = 0, narrationFile = null;
const cues = [];                 // {s,e,t} — 내레이션 시작 기준 상대 ms
if (args.narrate) {
  const scriptPath = resolve(process.cwd(), args.narrate);
  const script = readFileSync(scriptPath, 'utf8')
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join('\n');
  if (!script) throw new Error(`--narrate 대본이 비었다: ${args.narrate}`);
  narrationFile = join(dirname(resolve(process.cwd(), args.out)), 'narration.mp3');
  const vttFile = narrationFile.replace(/\.mp3$/, '.vtt');
  mkdirSync(dirname(narrationFile), { recursive: true });
  const t = spawnSync('edge-tts',
    ['--voice', args.voice, '--rate', args.voiceRate, '--text', script,
     '--write-media', narrationFile, '--write-subtitles', vttFile],
    { encoding: 'utf8' });
  if (t.status !== 0 || !existsSync(narrationFile)) {
    throw new Error(`edge-tts 실패 — ${t.stderr?.trim() || t.error?.message || '출력 파일 없음'}`);
  }
  narrationMs = probeMs(narrationFile);

  // ★★★ 자막 큐 — 이게 C안(자막이 화면 주인공)의 전부다.
  //   edge-tts `--write-subtitles`가 **문장별 시작·끝 시각**을 준다(실측: 7문장 → 큐 8개).
  //   그래서 문장마다 따로 합성해 길이를 잴 필요가 없다 — 호출 1회로 프로소디도 자연스럽고
  //   타이밍도 정확하다. 시각은 **내레이션 시작(=START_OUT) 기준 상대값**이다.
  const vtt = existsSync(vttFile) ? readFileSync(vttFile, 'utf8') : '';
  const toMs = (h, m, s, ms) => (+h * 3600 + +m * 60 + +s) * 1000 + +ms;
  for (const m of vtt.matchAll(
    /(\d\d):(\d\d):(\d\d)[.,](\d{3})\s*-->\s*(\d\d):(\d\d):(\d\d)[.,](\d{3})\s*\n([\s\S]*?)(?:\n\s*\n|$)/g)) {
    const text = m[9].replace(/\s+/g, ' ').trim();
    if (text) cues.push({ s: toMs(m[1], m[2], m[3], m[4]), e: toMs(m[5], m[6], m[7], m[8]), t: text });
  }
  if (!cues.length) throw new Error(`자막 큐를 못 읽었다: ${vttFile} — 자막 없이 가려면 이 검사를 지우면 된다`);
  console.log(`음성: ${args.voice} · ${(narrationMs / 1000).toFixed(2)}s · 자막 큐 ${cues.length}개 → ${basename(narrationFile)}`);
}

// 음성이 있으면 줄 간격은 음성 길이에서 나온다. 없으면 지금까지 쓰던 470ms 그대로.
const LINE_STEP = narrationMs
  ? Math.max(200, Math.round(narrationMs / outLines.length))
  : 470;                                                   // 줄당 등장 간격
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
// ★ 캐릭터는 data URI로 심는다 — 프레임 캡처 중 로컬 파일 경로 접근에 기대지 않기 위해서다.
//   (파일 URL로 두면 렌더 타이밍에 따라 아직 안 뜬 프레임이 섞일 수 있다.)
const charDataURI = args.character
  ? 'data:image/png;base64,' + readFileSync(resolve(process.cwd(), args.character)).toString('base64')
  : null;
// 자막 모드에서는 하단을 채워야 하므로 크게(700), 자막이 없으면 README 실측값(520) 그대로.
const charH = args.charH ?? (cues.length ? 700 : 520);
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
:root { --bg:${pal.bg}; --panel:${pal.panel}; --line:${pal.line}; --text:${pal.text}; --dim:${pal.dim};
  --accent:${pal.accent}; --accent-dim:${pal.accentDim}; --on-accent:${pal.onAccent}; }
html,body { width:1080px; height:1920px; background:var(--bg); overflow:hidden; }
body { font-family:${fonts.mono}; color:var(--text); }
.chrome { display:flex; align-items:center; gap:16px; padding:44px 60px; border-bottom:1px solid var(--line); background:var(--panel); }
.dot { width:26px; height:26px; border-radius:50%; }
.chrome .t { margin-left:16px; font-size:38px; color:var(--dim); }
.term { padding:70px 64px; font-size:36px; line-height:1.64; }
.cmdline { color:var(--text); white-space:pre-wrap; word-break:keep-all; overflow-wrap:break-word; }
.prompt { color:var(--accent); font-weight:700; margin-right:14px; }
#cursor { display:inline-block; width:20px; height:46px; background:var(--accent); vertical-align:-6px; margin-left:4px; }
#out { margin-top:40px; }
/* ⚠️ 페이드에 CSS transition을 쓰지 않는다 — 투명도는 window.frame(t)가 t로 계산한다.
   트랜지션은 논리 시간 t가 아니라 벽시계로 돌아서, evaluate()와 screenshot() 사이에
   컴퓨터가 얼마나 걸렸냐에 따라 같은 t의 프레임이 매번 다르게 찍힌다.
   2026-08-10 실측: 같은 입력 2회 렌더에 236장 중 19장 불일치. */
.ln { opacity:0; margin:10px 0; white-space:pre-wrap; word-break:keep-all; overflow-wrap:break-word; }
.ln .tag { color:var(--dim); }
.ln .ok { color:var(--accent); font-weight:700; }
.ln .success { color:var(--accent); font-weight:800; }
.cta { position:absolute; left:0; right:0; bottom:0; opacity:0;   /* 페이드는 위와 같은 이유로 t 계산 */
  display:flex; gap:24px; justify-content:center; align-items:center;
  padding:48px 40px 60px; background:linear-gradient(transparent, ${rgba(pal.bg, 0.9)} 30%); }
.pill { font-size:40px; font-weight:800; padding:26px 40px; border-radius:16px; }
.pill.save { background:var(--accent); color:var(--on-accent); }
.pill.follow { border:2px solid var(--accent); color:var(--accent); }
/* 훅 프레임 — 터미널이 아니라 카드 톤(산세리프 큰 글씨)이어야 스크롤 중에 읽힌다 */
/* ★★★ C안 (2026-08-11) — 자막이 화면 주인공이다.
   기존 구조는 터미널 줄이 주인공이라 **읽을 것만 있고 볼 것이 없었다**(8/11 사용자 관찰 +
   벤치마크 4계정 대조). 자막을 크게 세우고 터미널은 위로 밀어 **증거**로 축소한다.
   레이아웃(1080×1920, 2026-08-11 2차 조정 — 캐릭터를 키워 하단을 채운다):
     chrome 0~114 / 터미널 114~620 / **자막 640~894** / **캐릭터 920~1620(700px)** / CTA 하단.
   ⚠️ 캐릭터 바닥은 300px 위에 고정이다 — 인스타 릴스 하단 UI(캡션·버튼)가 그만큼 덮는다(README 실측).
      그래서 캐릭터를 키우려면 **아래로 못 늘리고 위로만** 늘어나고, 자막·터미널이 같이 올라가야 한다.
   ⚠️ text-wrap:pretty 는 render.js에서 고아 줄 14건을 0으로 만든 그 한 줄이다 — 여기도 넣는다.
   ⚠️⚠️ 이 주석에 백틱을 쓰지 말 것. 이 CSS는 템플릿 문자열 안이라 백틱이 문자열을 끊는다.
        2026-08-10에 같은 자리에서 SyntaxError를 냈고 오늘 또 냈다 — 두 번째다. */
.term.compact { font-size:28px; line-height:1.5; padding:36px 64px; height:480px;
  box-sizing:border-box; overflow:hidden; }
.term.compact #out { margin-top:26px; }
.term.compact .ln { margin:6px 0; }
#sub { position:absolute; left:0; right:0; top:640px; padding:0 76px;
  font-family:${fonts.sans}; font-size:64px; font-weight:800; line-height:1.32;
  color:var(--text); text-wrap:pretty; word-break:keep-all; overflow-wrap:break-word;
  letter-spacing:-0.02em; }
/* ★ 캐릭터 (2026-08-11). assets/characters/README.md의 **실측 배치를 그대로** 쓴다:
   높이 520px · 우측 여백 56px · 바닥에서 300px 이상(인스타 하단 UI인 캡션·버튼을 피하는 값).
   ⚠️ image-rendering:pixelated 필수 — 픽셀아트를 bilinear로 늘리면 계단이 뭉개져 정체성이 깨진다.
   z-index 4 = 훅(5)보다 아래. 0초엔 훅이 화면을 덮으므로 캐릭터는 훅이 걷힌 뒤 나타난다. */
#char { position:absolute; right:56px; bottom:300px; height:${charH}px; z-index:4;
  image-rendering: pixelated; }
.hook { position:absolute; inset:0; background:var(--bg); z-index:5;
  display:flex; flex-direction:column; justify-content:center; padding:0 88px;
  font-family:${fonts.sans}; }
.hook .hb { align-self:flex-start; margin-bottom:56px; font-size:36px; color:var(--accent);
  border:2px solid var(--accent-dim); border-radius:999px; padding:18px 38px; letter-spacing:1px; }
.hook .ht { font-size:112px; line-height:1.2; font-weight:800; letter-spacing:-3px;
  word-break:keep-all; overflow-wrap:break-word; }
.hook .hs { margin-top:52px; font-size:50px; line-height:1.42; color:var(--dim);
  word-break:keep-all; overflow-wrap:break-word; }
.hook .hglow { position:absolute; width:1100px; height:1100px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, ${rgba(pal.accent, 0.16)} 0%, transparent 62%); top:-360px; right:-320px; }
</style></head><body>
<div class="chrome">
  <span class="dot" style="background:${pal.dots[0]}"></span>
  <span class="dot" style="background:${pal.dots[1]}"></span>
  <span class="dot" style="background:${pal.dots[2]}"></span>
  <span class="t">${esc(args.title)}</span>
</div>
<div class="term${cues.length ? ' compact' : ''}">
${cues.length ? '<div id="scroll">' : ''}
  <div class="cmdline"><span class="prompt">$</span><span id="cmd"></span><span id="cursor"></span></div>
  <div id="out">${outLines.map(lineHTML).join('')}</div>
${cues.length ? '</div>' : ''}
</div>
${cues.length ? `<div id="sub"></div>` : ''}
<div class="cta" id="cta">
  <span class="pill save">📌 저장</span>
  <span class="pill follow">▶ 팔로우하고 다음 편</span>
</div>
${charDataURI ? `<img id="char" src="${charDataURI}">` : ''}
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
const CUES = ${JSON.stringify(cues)};
const FADE_MS = 180, CTA_FADE_MS = 300;   // 종전 CSS transition 값 그대로

// CSS ease = cubic-bezier(.25,.1,.25,1). x(진행률)를 이분법으로 풀어 y(투명도)를 낸다.
// 근사가 아니라 같은 곡선이다 — 페이드 모양은 유지하고 시간 기준만 벽시계에서 t로 옮긴 것.
const bez = (a, b, u) => 3*(1-u)*(1-u)*u*a + 3*(1-u)*u*u*b + u*u*u;
const ease = (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; bez(.25, .25, m) < x ? lo = m : hi = m; }
  return bez(.1, 1, (lo + hi) / 2);
};
const fade = (t, at, dur) => ease((t - at) / dur).toFixed(4);

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
  // 줄 i는 START_OUT + i*STEP 에 등장을 시작해 FADE_MS 동안 올라온다
  for (let i = 0; i < kids.length; i++) {
    kids[i].style.opacity = looping ? '0' : fade(t, START_OUT + i * STEP, FADE_MS);
  }
  const cur = document.getElementById('cursor');
  cur.style.display = (!looping && shown >= NLINES) ? 'none' : 'inline-block';
  cur.style.visibility = (Math.floor(t/500) % 2 === 0) ? 'visible' : 'hidden';
  // ★ CTA는 마지막 줄(결론)이 나온 뒤에만 띄운다 — 종전엔 1.4초에 떠서
  //   가치를 전달하기 전에 "팔로우하세요"가 먼저 나왔고, 그게 3초 이탈 구간 안이었다.
  //   CTA는 마지막 줄과 같은 순간에 올라오기 시작한다 (종전 shown >= NLINES 시점과 동일)
  document.getElementById('cta').style.opacity =
    (!looping && !onHook) ? fade(t, START_OUT + (NLINES - 1) * STEP, CTA_FADE_MS) : '0';

  // ★★★ 자막 (C안) — 내레이션 시작(START_OUT) 기준 상대 시각으로 활성 큐를 고른다.
  //   ⚠️ 큐 경계가 50ms 겹치는 구간이 있다(edge-tts 출력). **먼저 맞는 것을 쓴다** — 결정론적이다.
  const sub = document.getElementById('sub');
  if (sub) {
    const rel = t - START_OUT;
    let txt = '';
    for (const c of CUES) { if (rel >= c.s && rel < c.e) { txt = c.t; break; } }
    sub.textContent = onHook ? '' : txt;
  }

  // ★ 터미널 스크롤 — 축소된 터미널에 13줄이 다 안 들어간다.
  //   ⚠️ 높이를 산술로 계산하지 않고 **DOM에서 실측**한다(글꼴·줄바꿈에 따라 달라지므로).
  //   ⚠️⚠️ #out만 밀면 **명령어 줄은 제자리에 남아 출력 줄이 그 위에 겹친다**(2026-08-11 실측 버그).
  //        그래서 명령어 줄까지 감싼 #scroll을 통째로 민다 = 진짜 터미널처럼 위로 흘러 나간다.
  const term = document.querySelector('.term.compact');
  const sc = document.getElementById('scroll');
  if (term && sc) {
    // ⚠️ offsetTop 산술은 쓰지 않는다 — offsetParent가 body라 chrome 높이·패딩이 섞여 틀린다.
    //    변환을 0으로 되돌려 실제 위치를 재고 다시 적용한다(리플로 1회, 프레임 캡처라 무해).
    sc.style.transform = 'translateY(0px)';
    const last = kids[Math.max(0, shown - 1)];
    const over = last
      ? last.getBoundingClientRect().bottom - (term.getBoundingClientRect().bottom - 36)
      : 0;
    sc.style.transform = 'translateY(' + (-Math.max(0, over)) + 'px)';
  }
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
// ★ 음성이 있으면 무음 트랙 대신 내레이션을 얹는다 (2026-08-11).
//   adelay로 START_OUT만큼 밀어 **줄이 뜨기 시작하는 순간에 목소리가 시작**되게 한다.
//   훅(0~HOOK_MS)과 명령어 타이핑 구간은 그대로 무음이다 — 훅은 글자로 이미 결론을 준다.
//   apad + `-t durSec` = 음성이 끝난 뒤 END_HOLD 구간은 무음으로 채우고 영상 길이에서 자른다.
const delayMs = Math.round(START_OUT);
const ffArgs = narrationFile ? [
  '-y',
  '-framerate', String(args.fps), '-i', join(framesDir, 'f-%05d.png'),
  '-i', narrationFile,
  '-filter_complex', `[1:a]adelay=${delayMs}|${delayMs},apad[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(args.fps),
  '-c:a', 'aac', '-b:a', '128k', '-t', durSec, '-movflags', '+faststart',
  outAbs,
] : [
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
