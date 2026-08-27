// check-threads-insights.mjs — 스레드 게시물 인사이트 일괄 조회 (읽기 전용, 발행 없음)
//
// 사용법: node check-threads-insights.mjs              (기본 계정 · THREADS_ACCESS_TOKEN)
//         node check-threads-insights.mjs --account 2  (두 번째 계정 · THREADS_ACCESS_TOKEN_2)
//
// ⚠️ 계정 핸들은 여기 적지 않는다 (2026-08-26). 이 파일은 공개 자료 1호에 들어간다 —
//    본계정 핸들은 LICENSE 에 이미 공개돼 있지만 **두 번째 계정은 그렇지 않다.**
//    어느 토큰이 어느 계정인지는 .env 키 이름과 볼트가 들고 있으면 충분하다.
//
// ⛔ 2026-08-25 에 두 번째 계정을 열었는데 이 스크립트가 첫 계정 토큰을 박아 쓰고 있어서
//    **2계정 성과를 아예 못 봤다.** 개통 후 하루 넘게 「인사이트를 본다」고 믿으면서
//    한쪽 계정만 보고 있었다. 계정을 늘리면 재는 도구도 같이 늘려야 한다.
//    ★ publish.mjs:67 이 이미 같은 분기를 갖고 있었다 — 발행은 두 계정을 알았는데
//      측정은 몰랐다. **같은 사실이 두 곳에 있으면 한 곳만 고쳐진다.**

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TH_BASE = 'https://graph.threads.net/v1.0';

const env = loadEnv(HERE);

async function api(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  const json = await res.json();
  return { ok: res.ok, json };
}

// ── 계정 선택 ──────────────────────────────────────────────────
// publish.mjs:67 과 같은 규칙을 쓴다. 두 곳이 갈리면 발행한 계정과 잰 계정이 달라진다.
const ai = process.argv.indexOf('--account');
const ACCOUNT = ai >= 0 && process.argv[ai + 1] ? process.argv[ai + 1] : '1';
if (!['1', '2'].includes(ACCOUNT)) {
  console.log(`⛔ --account 는 1 또는 2 다 (받은 값: ${ACCOUNT})`);
  process.exit(1);
}
const TOKEN_KEY = ACCOUNT === '1' ? 'THREADS_ACCESS_TOKEN' : 'THREADS_ACCESS_TOKEN_2';
const token = env[TOKEN_KEY];
// ⚠️ 키 이름만 찍는다. 토큰 값은 어디에도 출력하지 않는다.
if (!token) {
  console.log(`⛔ .env 에 ${TOKEN_KEY} 가 없다 — 계정 ${ACCOUNT} 를 잴 수 없다.`);
  process.exit(1);
}

const me = await api(`${TH_BASE}/me`, { fields: 'id,username', access_token: token });
// ⛔ 2026-08-26: 종전에는 실패해도 그냥 `@undefined` 를 찍고 계속 갔다.
//    그다음 줄에서 list.json.data 가 undefined 라 TypeError 로 죽는데,
//    화면에는 계정 이름이 안 나온 것만 보여서 **토큰 문제인 줄 모른다.**
//    ★ 조용한 실패보다 나쁜 건 엉뚱한 데서 시끄럽게 죽는 것이다.
if (!me.ok || !me.json?.username) {
  console.log(`⛔ 계정 조회 실패 (${TOKEN_KEY}) — 토큰이 만료됐거나 권한이 없다.`);
  console.log(`   응답: ${JSON.stringify(me.json).slice(0, 300)}`);
  process.exit(1);
}
console.log(`계정 ${ACCOUNT}: @${me.json.username}  (${TOKEN_KEY})\n`);

const list = await api(`${TH_BASE}/${me.json.id}/threads`, {
  fields: 'id,text,timestamp,media_type,permalink',
  // ⛔ 2026-08-24: 25 면 잘린다. 8/23 발행 원고가 「평균 조회수 223·중앙값 5x」를
  //    공개 선언했는데, 잘린 25건으로 재면 평균 68·중앙 48 이 나온다.
  //    ★ 모집단이 다르면 평균을 비교할 수 없다 — 대표값을 발행하는 계정에서
  //      이 한 줄이 원고를 거짓으로 만든다. check-insights.mjs 와 같은 계열.
  limit: '100',
  access_token: token,
});

// ★ API 는 timestamp 를 UTC(+0000) 로 준다. 그대로 slice(0,10) 하면 UTC 날짜다.
//   07:00 KST = 전날 22:00 UTC 라 **아침 발행분이 하루 앞당겨 찍힌다.**
//   19:00 KST = 10:00 UTC 라 저녁 발행분은 안 밀린다 —
//   그래서 2026-08-24 아침 슬롯이 생기기 전까지 이 버그는 드러날 수 없었다.
//
//   ⛔ 2026-08-24 에 볼트(성과 진단 로그)가 이걸 찾아 「스크립트 수정 후보」로 적어뒀는데
//      코드로 안 옮겼고, 하루 뒤 2026-08-25 에 같은 착각을 또 했다("AM 스레드가 없다").
//      결정만 적으면 새 세션에서 조용히 회귀한다. 그래서 여기에 박는다.
const kstDate = (ts) => {
  if (!ts) return '????-??-??';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 10);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // sv-SE = YYYY-MM-DD
};

// 같은 이유로 목록도 확인하고 들어간다 — 빈 배열과 조회 실패는 다른 것이다.
if (!list.ok || !Array.isArray(list.json?.data)) {
  console.log(`⛔ 게시물 목록 조회 실패 — ${JSON.stringify(list.json).slice(0, 300)}`);
  process.exit(1);
}
if (!list.json.data.length) {
  console.log('게시물 0건 — 아직 발행한 것이 없거나 권한 범위 밖이다.');
  process.exit(0);
}

for (const t of list.json.data) {
  if (t.media_type === 'REPOST_FACADE') continue;
  const cap = (t.text ?? '').slice(0, 28).replace(/\n/g, ' ');
  const insights = await api(`${TH_BASE}/${t.id}/insights`, {
    metric: 'views,likes,replies,reposts,quotes,shares',
    access_token: token,
  });
  if (!insights.ok) { console.log(`[${kstDate(t.timestamp)} KST] "${cap}" ❌ ${JSON.stringify(insights.json)}`); continue; }
  const line = insights.json.data.map(i => `${i.name}=${i.values?.[0]?.value ?? i.total_value?.value}`).join(' · ');
  console.log(`[${kstDate(t.timestamp)} KST] "${cap}"\n  ${line}`);
}

// ── 아웃바운드 활동 (2026-08-27 신설) ─────────────────────────────
//
// 왜 여기 붙였나:
//   2026-08-26 22:10 부터 사람이 **남의 글에 답글·리포스트**를 하기 시작했다.
//   그 직전 두 회차는 조회 3·3 이었고, 그 뒤 두 회차는 43·38 이다.
//   ⛔ 그런데 같은 시점에 **소재도 바뀌었다**(토스 기능 설명 → 자동화·막힘 고백).
//      둘이 완전히 교락돼서 무엇이 올렸는지 못 가른다.
//   ★★ 못 가르는 것보다 나쁜 건 **세지도 않는 것**이다. 세어두면 나중에
//      활동이 뜸한 날이 저절로 생겼을 때 그게 자연 실험이 된다.
//
// 판정 규칙: `/me/replies` 의 `root_post.username` 이 **내 핸들이 아니면 남의 글**이다.
//   ⚠️ 남의 글은 username 이 아예 안 온다(권한 밖). 그래서 "다르면"이 아니라
//      "내 핸들과 같지 않으면"으로 판정한다 — 빈 값도 남의 글로 센다.
//   ⛔ `is_reply_owned_by_me` 로는 못 가른다. 내가 쓴 답글이면 전부 true 라
//      "누구 글에 달았나"를 말해주지 않는다(2026-08-27 실측).
const pageAll = async (url, params) => {
  let r = await api(url, params);
  const all = [...(r.json?.data ?? [])];
  while (r.json?.paging?.next) { const res = await fetch(r.json.paging.next); r = { ok: res.ok, json: await res.json() }; all.push(...(r.json?.data ?? [])); }
  return all;
};

const reps = await pageAll(`${TH_BASE}/${me.json.id}/replies`, {
  fields: 'id,timestamp,root_post{username}', limit: '100', access_token: token,
});
const roots = await pageAll(`${TH_BASE}/${me.json.id}/threads`, {
  fields: 'id,timestamp,media_type', limit: '100', access_token: token,
});
const outbound = reps.filter((r) => (r.root_post?.username ?? '') !== me.json.username);
const reposts = roots.filter((r) => r.media_type === 'REPOST_FACADE');

const byDay = {};
for (const r of outbound) (byDay[kstDate(r.timestamp)] ??= { rep: 0, rp: 0 }).rep++;
for (const r of reposts) (byDay[kstDate(r.timestamp)] ??= { rep: 0, rp: 0 }).rp++;
const days = Object.keys(byDay).sort().slice(-10);

console.log(`\n── 아웃바운드 활동 (남의 글에 단 답글 · 리포스트) ──`);
console.log(`   누적: 답글 ${outbound.length}건 · 리포스트 ${reposts.length}건`);
if (!days.length) console.log('   기록 없음');
else for (const d of days) console.log(`   ${d} KST   답글 ${String(byDay[d].rep).padStart(3)} · 리포스트 ${String(byDay[d].rp).padStart(3)}`);
console.log('   ⚠️ 이 숫자는 위 조회수와 **같은 날 안에서도 순서가 있다.** 발행보다 늦은 활동은');
console.log('      그 회차 초반 도달에 영향을 못 준다 — 판독할 때 시각까지 본다.');
