// slides.json -> 1080x1350 PNG 카드뉴스 렌더러
// 사용법: node render.js [slides파일경로]   (기본: ./slides.json)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, process.argv[2] ?? "slides.json");
const data = JSON.parse(readFileSync(dataPath, "utf-8"));
const { meta, slides } = data;

const W = 1080, H = 1350;

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const ml = (s) => esc(s).replaceAll("\n", "<br>");

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0d1117; --panel: #161b22; --line: #30363d;
    --text: #e6edf3; --dim: #9aa4b2; --accent: #3fb950; --accent-dim: #238636;
  }
  body { background: #000; font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif; }
  .mono { font-family: 'Cascadia Code', 'D2Coding', Consolas, monospace; }
  .slide {
    width: ${W}px; height: ${H}px; background: var(--bg); color: var(--text);
    position: relative; overflow: hidden; display: flex; flex-direction: column;
  }
  .glow {
    position: absolute; width: 900px; height: 900px; border-radius: 50%;
    background: radial-gradient(circle, rgba(63,185,80,.13) 0%, transparent 62%);
    top: -320px; right: -280px; pointer-events: none;
  }
  .chrome {
    display: flex; align-items: center; gap: 14px;
    padding: 34px 56px; border-bottom: 1px solid var(--line); background: var(--panel);
  }
  .dot { width: 22px; height: 22px; border-radius: 50%; }
  .chrome .t { margin-left: 14px; font-size: 26px; color: var(--dim); }
  .chrome .pg { margin-left: auto; font-size: 26px; color: var(--dim); letter-spacing: 2px; }
  .inner { flex: 1; display: flex; flex-direction: column; padding: 88px 92px 72px; position: relative; }
  .kicker { display: inline-flex; align-items: center; gap: 16px; font-size: 30px; color: var(--accent); letter-spacing: 1px; margin-bottom: 40px; }
  .kicker::before { content: "$"; opacity: .7; }
  .badge {
    align-self: flex-start; font-size: 28px; color: var(--accent);
    border: 2px solid var(--accent-dim); border-radius: 999px; padding: 14px 30px;
    margin-bottom: 56px; letter-spacing: 1px;
  }
  h1 { font-size: 96px; line-height: 1.22; font-weight: 800; letter-spacing: -1px; }
  h2 { font-size: 76px; line-height: 1.26; font-weight: 800; letter-spacing: -0.5px; }
  .sub { margin-top: 44px; font-size: 40px; color: var(--dim); line-height: 1.5; }
  .body { margin-top: 48px; font-size: 41px; line-height: 1.62; color: var(--text); }
  .body b, .accent { color: var(--accent); }
  .cursor { display: inline-block; width: 20px; height: 66px; background: var(--accent); margin-left: 12px; vertical-align: -8px; animation: none; }
  .footer { margin-top: auto; }
  .next { display: flex; align-items: center; gap: 18px; font-size: 32px; color: var(--dim); }
  .next::before { content: ">"; color: var(--accent); font-weight: 700; }
  .next::after { content: "→"; color: var(--accent); margin-left: 6px; }
  .bar { margin-top: 34px; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .stats { margin-top: 40px; display: flex; flex-direction: column; gap: 36px; }
  .stat { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 44px 48px; }
  .stat .lb { font-size: 30px; color: var(--dim); margin-bottom: 18px; }
  .stat .row { display: flex; align-items: baseline; gap: 28px; }
  .stat .now { font-size: 72px; font-weight: 800; }
  .stat .arrow { font-size: 44px; color: var(--dim); }
  .stat .target { font-size: 72px; font-weight: 800; color: var(--accent); }
  .follow {
    margin-top: 56px; align-self: flex-start; background: var(--accent); color: #04260f;
    font-size: 38px; font-weight: 800; padding: 30px 52px; border-radius: 16px;
  }
  .handle { margin-top: 40px; font-size: 30px; color: var(--dim); }

  /* --- curve: 리텐션 곡선 비교 (2026-08-05 신설) ---
     "완주율 %가 같아도 곡선 모양이 다르면 진단이 반대"라는 주장은 글로는 전달이 안 된다.
     실측 데이터를 파는 계정이므로 차트가 본문이다. */
  .charts { margin-top: 44px; display: flex; gap: 32px; }
  .chart { flex: 1; background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 30px 26px 26px; }
  .chart .cl { font-size: 27px; color: var(--dim); }
  .chart .cv { font-size: 46px; font-weight: 800; margin: 8px 0 20px; }
  .chart svg { width: 100%; height: 200px; display: block; }
  .chart .cx { display: flex; justify-content: space-between; margin-top: 10px; font-size: 22px; color: var(--dim); }
  .chart .cn { margin-top: 16px; font-size: 27px; line-height: 1.45; color: var(--text); }
  .chart.bad .cv { color: #f85149; }
  .chart.good .cv { color: var(--accent); }

  /* --- table: 실측 비교표 (2026-08-05 신설) --- */
  .tbl { margin-top: 40px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
  .tr { display: flex; align-items: center; gap: 16px; padding: 22px 30px; border-top: 1px solid var(--line); font-size: 33px; }
  .tr:first-child { border-top: 0; background: var(--panel); color: var(--dim); font-size: 27px; }
  .tr.hi { background: rgba(63,185,80,.10); }
  .tr.lo { background: rgba(248,81,73,.08); }
  .tr .c1 { flex: 1.45; } .tr .c2 { flex: 1; text-align: right; color: var(--dim); }
  .tr .c3 { flex: .85; text-align: right; font-weight: 800; }
  .tr.hi .c3 { color: var(--accent); }
  .tr.lo .c3 { color: #f85149; }
  .note { margin-top: 34px; font-size: 30px; line-height: 1.5; color: var(--dim); }
`;

// 리텐션 곡선 SVG. points = [[시간%, 시청자%], ...]
// 렌더 실폭(약 380px)과 viewBox를 맞춰 preserveAspectRatio=none의 선 굵기 왜곡을 없앤다.
const curveSvg = (points, color) => {
  const CW = 380, CH = 200, p = 4;
  const xy = ([x, y]) => `${(x / 100) * (CW - p * 2) + p},${CH - p - (y / 100) * (CH - p * 2)}`;
  const grid = (yPct) => {
    const y = CH - p - (yPct / 100) * (CH - p * 2);
    return `<line x1="0" y1="${y}" x2="${CW}" y2="${y}" stroke="#30363d" stroke-width="1" stroke-dasharray="5 7"/>`;
  };
  return `<svg viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="none">
      ${grid(100)}${grid(50)}${grid(0)}
      <polyline points="${points.map(xy).join(' ')}" fill="none" stroke="${color}"
        stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
};

const chrome = (i, n) => `
  <div class="chrome">
    <span class="dot" style="background:#ff5f56"></span>
    <span class="dot" style="background:#ffbd2e"></span>
    <span class="dot" style="background:#27c93f"></span>
    <span class="t mono">${esc(meta.terminalTitle)}</span>
    <span class="pg mono">${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}</span>
  </div>`;

const footer = (s, i, n) => `
  <div class="footer">
    ${s.next ? `<div class="next mono">${esc(s.next)}</div>` : ""}
    <div class="bar"><i style="width:${((i + 1) / n) * 100}%"></i></div>
  </div>`;

function renderSlide(s, i, n) {
  let inner = "";
  if (s.type === "cover") {
    inner = `
      <div class="badge mono">${esc(s.badge)}</div>
      <h1>${ml(s.title)}<span class="cursor"></span></h1>
      <div class="sub">${ml(s.sub)}</div>
      ${footer(s, i, n)}`;
  } else if (s.type === "goal") {
    inner = `
      <div class="kicker mono">${esc(s.kicker)}</div>
      <div class="stats">
        ${s.stats.map(st => `
          <div class="stat">
            <div class="lb mono">${esc(st.label)}</div>
            <div class="row"><span class="now mono">${esc(st.now)}</span>
            <span class="arrow">→</span><span class="target mono">${esc(st.target)}</span></div>
          </div>`).join("")}
      </div>
      <div class="body">${ml(s.body)}</div>
      ${footer(s, i, n)}`;
  } else if (s.type === "curve") {
    inner = `
      <div class="kicker mono">${esc(s.kicker)}</div>
      <h2>${ml(s.heading)}</h2>
      <div class="charts">
        ${s.charts.map(c => `
          <div class="chart ${esc(c.tone ?? "")}">
            <div class="cl mono">${esc(c.label)}</div>
            <div class="cv mono">${esc(c.value)}</div>
            ${curveSvg(c.points, c.tone === "good" ? "#3fb950" : c.tone === "bad" ? "#f85149" : "#58a6ff")}
            <div class="cx mono"><span>시작</span><span>끝</span></div>
            <div class="cn">${ml(c.note)}</div>
          </div>`).join("")}
      </div>
      ${s.note ? `<div class="note">${ml(s.note)}</div>` : ""}
      ${footer(s, i, n)}`;
  } else if (s.type === "table") {
    inner = `
      <div class="kicker mono">${esc(s.kicker)}</div>
      <h2>${ml(s.heading)}</h2>
      <div class="tbl mono">
        ${s.rows.map(r => `
          <div class="tr ${esc(r.tone ?? "")}">
            <span class="c1">${esc(r.cells[0])}</span>
            <span class="c2">${esc(r.cells[1])}</span>
            <span class="c3">${esc(r.cells[2])}</span>
          </div>`).join("")}
      </div>
      ${s.note ? `<div class="note">${ml(s.note)}</div>` : ""}
      ${footer(s, i, n)}`;
  } else if (s.type === "cta") {
    inner = `
      <h2>${ml(s.heading)}</h2>
      <div class="body">${ml(s.body)}</div>
      <div class="follow">${esc(s.followLabel)}</div>
      <div class="handle mono">${esc(meta.handle)}</div>
      ${footer(s, i, n)}`;
  } else {
    inner = `
      <div class="kicker mono">${esc(s.kicker)}</div>
      <h2>${ml(s.heading)}</h2>
      <div class="body">${ml(s.body)}</div>
      ${footer(s, i, n)}`;
  }
  return `<div class="slide" id="s${i}"><div class="glow"></div>${chrome(i, n)}<div class="inner">${inner}</div></div>`;
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head>
<body>${slides.map((s, i) => renderSlide(s, i, slides.length)).join("\n")}</body></html>`;

const outDir = resolve(__dirname, meta.outDir);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });

for (let i = 0; i < slides.length; i++) {
  const base = `slide-${String(i + 1).padStart(2, "0")}`;
  const png = resolve(outDir, `${base}.png`);
  await page.locator(`#s${i}`).screenshot({ path: png });
  // Instagram/Threads API는 JPEG만 허용 — 발행용으로 같은 컷을 JPEG로도 출력
  const jpg = resolve(outDir, `${base}.jpg`);
  await page.locator(`#s${i}`).screenshot({ path: jpg, type: "jpeg", quality: 92 });
  console.log(`rendered: ${png} (+jpg)`);
}
await browser.close();
console.log(`done. ${slides.length} slides -> ${outDir}`);
