// 구축기(메이킹) 스크린샷 생성기 — Scene Library 씨앗
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "making-of/day-0");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

// ── 1. 라이브 게시물 / 2. 프로필 (공개 페이지)
const shots = [
  { url: "https://www.instagram.com/p/Da2DWE8oLNk/", file: "02-live-post.png" },
];
for (const s of shots) {
  try {
    await page.goto(s.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500);
    // 회원가입 모달 닫기 (Escape → X 버튼 순서로 시도)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const closeBtn = page.locator('div[role="dialog"] svg[aria-label]').first();
    if (await closeBtn.count() > 0 && await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click().catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: resolve(outDir, s.file) });
    console.log("shot:", s.file);
  } catch (e) { console.log("skip:", s.file, e.message.split("\n")[0]); }
}

// ── 3. 터미널 렌더 로그 카드 / 4. 코드 카드 (1080x1350, 카드뉴스에 바로 사용 가능)
const termLog = [
  "$ node render.js",
  "",
  "rendered: out/day-0/slide-01.png",
  "rendered: out/day-0/slide-02.png",
  "rendered: out/day-0/slide-03.png",
  "rendered: out/day-0/slide-04.png",
  "rendered: out/day-0/slide-05.png",
  "rendered: out/day-0/slide-06.png",
  "rendered: out/day-0/slide-07.png",
  "",
  "done. 7 slides -> out/day-0",
];
const slidesJson = readFileSync(resolve(__dirname, "slides.json"), "utf-8").split("\n").slice(0, 30).join("\n");

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const card = (title, body, hl) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; }
  body { width:1080px; height:1350px; background:#0d1117; display:flex; flex-direction:column;
         font-family:'Cascadia Code','D2Coding',Consolas,monospace; padding:72px; }
  .win { flex:1; background:#161b22; border:1px solid #30363d; border-radius:20px; overflow:hidden;
         display:flex; flex-direction:column; box-shadow:0 24px 80px rgba(0,0,0,.5); }
  .bar { display:flex; gap:12px; align-items:center; padding:26px 32px; border-bottom:1px solid #30363d; }
  .dot { width:18px; height:18px; border-radius:50%; }
  .t { margin-left:10px; color:#9aa4b2; font-size:24px; }
  pre { flex:1; padding:44px 48px; color:#e6edf3; font-size:${hl ? 26 : 30}px; line-height:1.7; white-space:pre-wrap; word-break:break-all; }
  .g { color:#3fb950; } .d { color:#9aa4b2; }
  .cap { color:#9aa4b2; font-size:28px; text-align:center; padding-top:40px; }
</style></head><body>
  <div class="win">
    <div class="bar"><span class="dot" style="background:#ff5f56"></span><span class="dot" style="background:#ffbd2e"></span><span class="dot" style="background:#27c93f"></span><span class="t">${esc(title)}</span></div>
    <pre>${body}</pre>
  </div>
  <div class="cap">무인 수익 실험 · Day 0 메이킹</div>
</body></html>`;

const termBody = termLog.map(l => l.startsWith("$") ? `<span class="g">${esc(l)}</span>` : l.startsWith("done") ? `<span class="g">${esc(l)}</span>` : esc(l)).join("\n");
const cardPage = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await cardPage.setContent(card("terminal — cardnews-pipeline", termBody, false));
await cardPage.screenshot({ path: resolve(outDir, "01-terminal-render.png") });
console.log("shot: 01-terminal-render.png");

await cardPage.setContent(card("slides.json — 내용만 바꾸면 재생성", `<span class="d">${esc(slidesJson)}</span>`, true));
await cardPage.screenshot({ path: resolve(outDir, "04-slides-json.png") });
console.log("shot: 04-slides-json.png");

// ── Day 0 프로필 상태 카드 (실측 수치 박제 — 회고 콘텐츠용)
const statCard = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; }
  body { width:1080px; height:1350px; background:#0d1117; color:#e6edf3; display:flex; flex-direction:column;
         justify-content:center; padding:96px; font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif; }
  .mono { font-family:'Cascadia Code','D2Coding',Consolas,monospace; }
  .date { color:#3fb950; font-size:34px; margin-bottom:28px; }
  h1 { font-size:84px; font-weight:800; margin-bottom:20px; }
  .handle { color:#9aa4b2; font-size:36px; margin-bottom:64px; }
  .row { display:flex; gap:28px; margin-bottom:64px; }
  .stat { flex:1; background:#161b22; border:1px solid #30363d; border-radius:20px; padding:40px; text-align:center; }
  .stat .n { font-size:88px; font-weight:800; }
  .stat .l { color:#9aa4b2; font-size:30px; margin-top:12px; }
  .bio { color:#9aa4b2; font-size:34px; line-height:1.7; border-left:6px solid #3fb950; padding-left:32px; }
</style></head><body>
  <div class="date mono">2026-07-16 · DAY 0 · 기록 시작</div>
  <h1>여기가 출발선</h1>
  <div class="handle mono">instagram.com/@dhenddl1 · Digital creator</div>
  <div class="row">
    <div class="stat"><div class="n mono">1</div><div class="l">게시물</div></div>
    <div class="stat"><div class="n mono">0</div><div class="l">팔로워</div></div>
    <div class="stat"><div class="n mono">0<span style="font-size:44px">원</span></div><div class="l">수익</div></div>
  </div>
  <div class="bio">현직 개발자의 무인 수익 실험 🧪<br>자는 동안 돌아가는 AI 콘텐츠 시스템 만드는 중<br>성공도 실패도 숫자 그대로 공개합니다</div>
</body></html>`;
await cardPage.setContent(statCard);
await cardPage.screenshot({ path: resolve(outDir, "03-day0-stats.png") });
console.log("shot: 03-day0-stats.png");

await browser.close();
console.log("done ->", outDir);
