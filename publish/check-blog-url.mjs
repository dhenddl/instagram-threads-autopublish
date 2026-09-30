// check-blog-url.mjs — 우리 블로그 링크가 **살아 있는 주소인가** (발행 직전 게이트)
//   보는 자리 둘: ① `blogUrl` 필드  ② 본문·답글·캡션 텍스트 (2026-09-22 확장 — 사용자 지시)
//
// ── 왜 만들었나 (2026-08-31) ──────────────────────────────────────
// 「블로그 방문자 유입 특단 조치 (2026-08-30)」 관 ①.
// 진단: `pipeline/publish/post-*.json` **91개 중 블로그 링크 0건.** 스레드 중앙 ~70,
// 릴스 중앙 ~113 의 도달이 **블로그로 한 번도 흘러간 적이 없다.**
// ▶ 매니페스트에 `blogUrl` 을 두고 `publish.mjs` 가 **스레드 답글 마지막에** 붙인다.
//   이 게이트는 그 주소가 **실제로 열리는지** 발행 전에 본다.
//   ⛔ 죽은 링크를 단 답글은 안 다느니만 못하다 — 되돌릴 수 없다.
//
// ── ⛔⛔ 이 게이트만 네트워크를 탄다. 그래서 판정을 둘로 가른다 ──────
// 형제 게이트 넷은 전부 **파일만** 본다(오프라인·즉시). 이건 아니다.
// ★★ 순간 장애로 막으면 **그날 19:00 스레드가 안 나간다.** 그건 안전장치가 아니라 사고다
//    — CLAUDE.md 가 「전량 검사를 걸지 않는다」로 이미 같은 실수를 막아둔 자리다.
//
//   ⛔ 막는다(exit 2 유발)  : 모양이 틀렸다 · 우리 도메인이 아니다 · 2계정이다  ← **오프라인으로 확실한 것**
//                            404 · 410 · 403                                ← **주소가 죽은 게 확실한 것**
//   ⚠️ 경고만(통과)        : 타임아웃 · DNS 실패 · 5xx · 그 외 네트워크 오류   ← **못 물어본 것**
//
// ★ 볼트가 반복해서 적은 그 축이다 — **「못 물어본 것」과 「없는 것」은 다르다.**
//   실패를 「링크 죽음」으로 삼키면 멀쩡한 회차가 안 나가고, 그게 더 나쁘다.
//
// ── 사용 ─────────────────────────────────────────────────────────
//   node check-blog-url.mjs                     전량
//   node check-blog-url.mjs --only post-x.json  그 회차만 (publish.mjs 가 이렇게 부른다)
//   node check-blog-url.mjs --offline           네트워크 검사 건너뛰고 모양만
//
// 종료 코드: 0 = 통과(경고 포함) · 1 = 차단

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// ⛔ 우리 블로그만 허용한다. 매니페스트에 아무 주소나 들어가면 이 필드가
//   「블로그 유입 관」이 아니라 **범용 링크 칸**이 되고, 그러면 토스 링크 규칙
//   (고시문구·계정 분리)을 우회하는 문이 된다.
const ALLOWED_HOSTS = ['dhenddl1.tistory.com', 'blog.naver.com', 'm.blog.naver.com'];

const TIMEOUT_MS = 8000;

// ★ `--only` 문법은 형제 게이트 넷과 **같아야 한다.**
//   호출 규칙이 다르면 publish.mjs 호출부에서 하나만 틀리고, 그건 조용히 통과한다.
const oi = process.argv.indexOf('--only');
const OFFLINE = process.argv.includes('--offline');
const argFile = oi >= 0 && process.argv[oi + 1]
  ? basename(process.argv[oi + 1])
  : (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null);

if (argFile && !existsSync(join(HERE, argFile))) {
  // ⛔ 없는 파일을 조용히 0건 검사하고 통과시키지 않는다.
  console.error(`⛔ ${argFile} 을 못 찾았다 (경로: ${HERE})`);
  process.exit(1);
}

const files = argFile
  ? [argFile]
  : readdirSync(HERE).filter((f) => f.startsWith('post-') && f.endsWith('.json')).sort();

// blogUrl 은 문자열이거나 { url, text } 다. 문자열이면 publish.mjs 의 기본 문구를 쓴다.
function urlOf(m) {
  const b = m.blogUrl;
  if (b === undefined || b === null) return null;
  if (typeof b === 'string') return { url: b.trim(), text: null };
  if (typeof b === 'object' && typeof b.url === 'string') {
    return { url: b.url.trim(), text: typeof b.text === 'string' ? b.text : null };
  }
  return { url: null, text: null, malformed: true };
}

async function probe(url) {
  // HEAD 를 먼저 — 본문을 안 받는다. 티스토리·네이버가 HEAD 를 거부할 수 있어 GET 으로 물러선다.
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue;
      return { status: res.status, finalUrl: res.url };
    } catch (e) {
      if (method === 'GET') return { err: e.name === 'TimeoutError' ? '타임아웃' : (e.message || String(e)) };
    }
  }
  return { err: '알 수 없음' };
}

// ── 본문·답글·캡션 속 블로그 링크도 본다 (2026-09-22 신설 — 사용자 지시) ──────
// 📌 왜: 2026-09-21 사용자 결정으로 E(블로그 유도) 회차는 **본문에 링크를 둘 수 있게** 됐다.
//   그런데 이 게이트는 `blogUrl` **필드만** 읽어서 **본문에 넣은 링크는 아무도 안 봤다.**
//   🔬 2026-09-22 에 실제로 그랬다 — 10/03 회차 본문에 링크를 넣었는데
//      이 게이트가 「blogUrl 있는 회차 0개」를 찍고 통과시켰다. **빈 자리와 구분이 안 됐다.**
//
// ⛔⛔ **우리 블로그 호스트만 뽑는다.** 발행 텍스트에 toss.im 링크가 **74건** 있다(2026-09-22 실측).
//   전부 긁으면 매 발행마다 남의 도메인을 때리고 **토스 404 하나로 그날 글이 안 나간다.**
//   토스 링크의 모양·고시문구·계정 분리는 `check-toss` 가 따로 본다. **축이 다르다.**
//
// 🔬 신설 시점 영향 측정: 우리 블로그 링크가 본문에 있는 회차 **5건**
//   (지나간 4건 = `/notice/18` · 앞으로 1건 = 10/03 `/26`). **둘 다 HTTP 200 확인.**
//   ▶ **이미 나간 회차를 막지 않는다** — 볼트가 2026-08-28 에 정한 선이다.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function bodyUrls(m) {
  const surfaces = [['캡션', m.caption], ['본문', m.threadsText]];
  if (Array.isArray(m.threadsReplies)) {
    m.threadsReplies.forEach((r, i) => surfaces.push([`답글${i + 1}`, r]));
  }
  const seen = new Map();
  for (const [where, text] of surfaces) {
    if (typeof text !== 'string') continue;
    for (const raw of text.match(URL_RE) ?? []) {
      const u = raw.replace(/[.,)]+$/, '');   // 문장 끝 구두점이 딸려온다
      let host;
      try { host = new URL(u).hostname; } catch { continue; }
      if (!ALLOWED_HOSTS.includes(host)) continue;
      if (!seen.has(u)) seen.set(u, where);
    }
  }
  return [...seen.entries()].map(([url, where]) => ({ url, where }));
}

// ⛔ 같은 주소를 회차마다 다시 묻지 않는다. 전량 검사에서 같은 링크가 여러 회차에 걸린다.
const PROBE_CACHE = new Map();
async function probeCached(url) {
  if (PROBE_CACHE.has(url)) return PROBE_CACHE.get(url);
  let r = await probe(url);
  if (r.err) r = await probe(url);   // 한 번만 다시. 순간 장애를 실패로 굳히지 않는다.
  PROBE_CACHE.set(url, r);
  return r;
}

// ★★ 네트워크 판정은 **이 함수 하나**다. blogUrl 경로와 본문 경로가 같은 규약을 쓴다.
//   ⛔ 두 곳에 적으면 한 곳만 고쳐진다 — 이 볼트가 반복해서 데인 자리다.
//   돌려주는 값: 'block' | 'warn' | 'ok'
async function netVerdict(tag, url) {
  const r = await probeCached(url);
  if (r.err) {
    console.log(`⚠️ ${tag}\n   못 물어봤다 (${r.err}) — ${url}`);
    console.log('   ⛔ 「링크가 죽었다」가 아니다. **막지 않는다.** 발행 후 눈으로 한 번 확인할 것.');
    return 'warn';
  }
  if ([404, 410, 403].includes(r.status)) {
    console.log(`⛔ ${tag}\n   HTTP ${r.status} — 주소가 죽었거나 비공개다: ${url}`);
    return 'block';
  }
  if (r.status >= 500) {
    console.log(`⚠️ ${tag}\n   HTTP ${r.status} (서버 쪽) — ${url}`);
    console.log('   ⛔ 우리 원고 문제가 아니다. **막지 않는다.**');
    return 'warn';
  }
  if (r.status >= 400) {
    console.log(`⛔ ${tag}\n   HTTP ${r.status} — ${url}`);
    return 'block';
  }
  const moved = r.finalUrl && r.finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, '');
  console.log(`✅ ${tag}  HTTP ${r.status}  ${url}${moved ? `\n   ↪ 최종: ${r.finalUrl}` : ''}`);
  return 'ok';
}

let blocked = 0, warned = 0, scanned = 0, touched = 0, bodyTouched = 0;

for (const f of files) {
  const p = join(HERE, basename(f));
  let m;
  try { m = JSON.parse(readFileSync(p, 'utf8')); } catch { console.log(`⛔ JSON 파싱 실패: ${f}`); blocked++; continue; }
  scanned++;

  // ── 본문·답글·캡션 속 블로그 링크 (blogUrl 필드와 **별개로** 본다) ──────
  // ⛔ blogUrl 이 없는 회차도 여기를 지난다. 예전엔 `if (b === null) continue` 가
  //   본문 검사까지 같이 건너뛰었고, 그게 2026-09-22 의 공백이었다.
  const inBody = bodyUrls(m);
  if (inBody.length) {
    bodyTouched++;
    for (const { url, where } of inBody) {
      const tag = `${f} [${where}]`;
      let u2;
      try { u2 = new URL(url); } catch {
        console.log(`⛔ ${tag}\n   URL 로 못 읽는다: ${url}`); blocked++; continue;
      }
      if (u2.protocol !== 'https:') {
        console.log(`⛔ ${tag}\n   https 가 아니다: ${url}`); blocked++; continue;
      }
      // ⛔ 2계정은 토스 링크만 단다 (2026-08-28 링크 밀도 조정). blogUrl 규칙과 같은 선이다.
      if (String(m.account ?? 1) === '2') {
        console.log(`⛔ ${tag}\n   2계정 회차 본문에 블로그 링크가 있다. 블로그 링크는 **본계정만** 단다.`);
        blocked++; continue;
      }
      if (OFFLINE) { console.log(`✅ ${tag}  ${url}  (모양만 — --offline)`); continue; }
      const v = await netVerdict(tag, url);
      if (v === 'block') blocked++;
      else if (v === 'warn') warned++;
    }
  }

  const b = urlOf(m);
  if (b === null) continue;              // blogUrl 없는 회차는 이 게이트와 무관하다
  touched++;

  if (b.malformed || !b.url) {
    console.log(`⛔ ${f}\n   blogUrl 모양이 틀렸다 — 문자열이거나 { url, text } 여야 한다.`);
    blocked++; continue;
  }

  // ── 오프라인 판정 (네트워크와 무관하게 확실한 것) ──────────────
  let u;
  try { u = new URL(b.url); } catch {
    console.log(`⛔ ${f}\n   URL 로 못 읽는다: ${b.url}`);
    blocked++; continue;
  }
  if (u.protocol !== 'https:') {
    console.log(`⛔ ${f}\n   https 가 아니다: ${b.url}`);
    blocked++; continue;
  }
  if (!ALLOWED_HOSTS.includes(u.hostname)) {
    console.log(`⛔ ${f}\n   우리 블로그가 아니다: ${u.hostname}`);
    console.log(`   허용: ${ALLOWED_HOSTS.join(' · ')}`);
    blocked++; continue;
  }
  // ⛔ 2계정(@dhenddl_t)은 토스 쉐어링크 계정이다. 2026-08-28 에 정지 사고 뒤
  //   **링크 밀도를 낮춘** 계정이라 블로그 링크를 더 얹지 않는다.
  //   ★ 이 규칙은 여기 한 곳에만 둔다 — publish.mjs 에도 적으면 한 곳만 고쳐진다.
  if (String(m.account ?? 1) === '2') {
    console.log(`⛔ ${f}\n   2계정 회차에 blogUrl 이 있다. 블로그 링크는 **본계정만** 단다.`);
    console.log('   (2026-08-28 링크 밀도 조정 — 2계정은 토스 링크만)');
    blocked++; continue;
  }

  if (OFFLINE) { console.log(`✅ ${f}  ${b.url}  (모양만 — --offline)`); continue; }

  // ── 네트워크 판정 — 규약은 netVerdict 한 곳에만 있다 ──────────
  const v = await netVerdict(f, b.url);
  if (v === 'block') { blocked++; continue; }
  if (v === 'warn') { warned++; continue; }
}

console.log(`\n매니페스트 ${scanned}개 검사 · blogUrl 필드 ${touched}개 · 본문에 블로그 링크 ${bodyTouched}개`);
if (blocked) {
  console.log(`⛔ 차단 ${blocked}건${warned ? ` · 경고 ${warned}건` : ''}`);
  process.exit(1);
}
console.log(`✅ 차단 사유 없음${warned ? ` (경고 ${warned}건 — 못 물어본 것이지 죽은 게 아니다)` : ''}`);
console.log('⛔ 이 게이트는 주소가 열리는지만 본다 — 그 글이 이 회차와 맞는 글인지는 사람이 판단한다.');
