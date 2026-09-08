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

import { readFileSync, appendFileSync } from 'node:fs';
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
// ⛔⛔ **「토큰 문제」와 「계정 조치」를 갈라야 한다** (2026-08-27 실전).
//   2계정 `@dhenddl_t` 가 개설 3일 만에 정지됐을 때 API 가 이렇게 답했다:
//     code 190 · "You cannot access the app till you log in to www.threads.com
//                 and follow the instructions given."
//   ★ 이건 **토큰이 죽은 게 아니라 계정에 조치가 걸린 것**이다. 사람이 웹에서 풀어야 한다.
//   ⚠️ 그런데 이 스크립트는 *"토큰이 만료됐거나 권한이 없다"* 라고만 찍었다 —
//     **토큰을 재발급하러 가게 만드는 오진**이고, 그러면 진짜 원인을 한참 못 찾는다.
//   ▶ 메시지로 갈라서 **다음 행동이 다르다는 걸** 화면에 적는다.
function 진단(json) {
  const msg = String(json?.error?.message ?? '');
  const code = json?.error?.code;
  if (code === 190 && /log in to www\.threads\.com|follow the instructions/i.test(msg)) {
    return {
      종류: '계정 조치(정지·제한)',
      할일: [
        '⛔ 토큰 문제가 아니다. 재발급해도 안 풀린다.',
        '① www.threads.com 에 웹으로 로그인해 안내를 이행한다(사람만 할 수 있다).',
        '② 해제될 때까지 그 계정 예약 작업을 멈춘다:',
        "   Get-ScheduledTask | ? {$_.TaskName -like 'dhenddl-publish-t-*'} | Disable-ScheduledTask",
        '③ 제재 중 반복 호출은 득이 없다. 상태 확인은 하루 한 번으로 충분하다.',
      ],
    };
  }
  if (code === 190) return { 종류: '토큰 만료·무효', 할일: ['refresh-tokens.mjs 로 갱신하거나 재발급한다.'] };
  return { 종류: '알 수 없음', 할일: ['아래 응답 원문을 그대로 읽는다.'] };
}

if (!me.ok || !me.json?.username) {
  const d = 진단(me.json);
  console.log(`⛔ 계정 조회 실패 (${TOKEN_KEY}) — **${d.종류}**`);
  for (const l of d.할일) console.log(`   ${l}`);
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
//   ⛔ 2026-08-24 에 볼트(<성과 기록 문서>)가 이걸 찾아 「스크립트 수정 후보」로 적어뒀는데
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

// ── 아웃바운드 활동을 **회차 출력보다 먼저** 받는다 (2026-08-28 재배치) ──────
//
// ⛔⛔ 종전에는 이 블록이 회차 목록 **뒤**에 있었고 **날짜별 합계만** 찍었다.
//   그래서 「발행 **전** 활동인가 발행 **후** 활동인가」를 아무것도 계산하지 않았다.
//   ★★ 그 탓에 t-04(2026-08-26 21:00)가 **「활동 있음」으로 잘못 분류됐다** —
//      첫 아웃바운드는 **22:10**, 즉 **발행 70분 뒤**다. 발행 시점 선행 활동은 0이었다.
//      `log.md:20152` 에 그 사실이 정확히 적혀 있었는데, 하루 뒤 요약이
//      「t-04·t-05 둘 다 활동 있음」으로 뭉갰고 브리핑과 t-07 원고가 그걸 물려받았다.
//   ★★★ **정밀한 실측은 다시 계산되지 않으면 거친 요약에 먹힌다.**
//        그래서 회차마다 **코드가 매번 세도록** 옮겼다. 사람 기억과 어제 문서에 맡기지 않는다.
//   📌 t-07(08-28) 원고의 판독 게이트가 요구하는 값이 정확히 이것이다:
//      *"발행 당일 09:00 **이전** 활동량"*. 종전 출력으로는 그 값을 못 읽었다.
//
// 판정 규칙: `/me/replies` 의 `root_post.username` 이 **내 핸들이 아니면 남의 글**이다.
//   ⚠️ 남의 글은 username 이 아예 안 온다(권한 밖). 그래서 "다르면"이 아니라
//      "내 핸들과 같지 않으면"으로 판정한다 — 빈 값도 남의 글로 센다.
//   ⛔ `is_reply_owned_by_me` 로는 못 가른다. 내가 쓴 답글이면 전부 true 라
//      "누구 글에 달았나"를 말해주지 않는다(2026-08-27 실측).
// ⛔ 조회가 실패해도 `?? []` 가 **빈 배열로 삼켜서** 모든 회차가 「선행활동 0」으로 찍힌다.
//    그건 「활동이 없었다」와 화면상 구별이 안 된다 — **가장 나쁜 종류의 조용한 실패**다.
//    ★ 이 스크립트는 그 함정을 08-26 에 한 번 겪었다(계정 조회 실패를 `@undefined` 로 넘겼다).
//    ▶ 그래서 실패하면 **세지 않고 알린다.** 숫자를 0 으로 내주지 않는다.
let 활동조회실패 = null;
const pageAll = async (url, params) => {
  let r = await api(url, params);
  if (!r.ok || !Array.isArray(r.json?.data)) {
    활동조회실패 = JSON.stringify(r.json ?? {}).slice(0, 200);
    return null;
  }
  const all = [...r.json.data];
  while (r.json?.paging?.next) { const res = await fetch(r.json.paging.next); r = { ok: res.ok, json: await res.json() }; all.push(...(r.json?.data ?? [])); }
  return all;
};

const reps = await pageAll(`${TH_BASE}/${me.json.id}/replies`, {
  // ⛔⛔ **남의 글에 단 답글은 `root_post` 가 아예 안 온다** (2026-08-28 실측, 권한 밖).
  //   내 글에 단 셀프 답글만 온다. 그래서 **「어떤 글에 달았을 때 잘 됐나」를 API 로는 못 본다.**
  //   ★★ 조회 5,754 가 **내 답글이 좋아서인지 그 글이 커서인지** 우리는 영영 모른다.
  //   ▶ 대신 **답글 자신의 `permalink`** 는 온다 — 사람이 열어보면 원글이 보인다.
  //      그래서 상위 답글에 링크를 찍는다. **판정을 코드에 넘기지 않고 사람에게 넘긴다.**
  fields: 'id,timestamp,permalink,root_post{username}', limit: '100', access_token: token,
});
const roots = await pageAll(`${TH_BASE}/${me.json.id}/threads`, {
  fields: 'id,timestamp,media_type', limit: '100', access_token: token,
});
const outbound = (reps ?? []).filter((r) => (r.root_post?.username ?? '') !== me.json.username);
const reposts = (roots ?? []).filter((r) => r.media_type === 'REPOST_FACADE');
if (활동조회실패) {
  console.log('⚠️ 아웃바운드 활동 조회에 실패했다 — **아래 「선행활동」은 전부 못 믿는다.**');
  console.log(`   응답: ${활동조회실패}`);
  console.log('   ⛔ 0 으로 찍히는 것을 「활동이 없었다」로 읽지 마라. 재실행해서 이 줄이 사라진 뒤에 판독한다.\n');
}

// ★ 순서를 알려면 **날짜가 아니라 시각**이 필요하다. 여기서만 ms 로 다룬다.
const kstDayOfMs = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const events = [...outbound, ...reposts]
  .map((r) => Date.parse(r.timestamp))
  .filter((n) => !Number.isNaN(n))
  .sort((a, b) => a - b);

// 발행 시각 기준 선행 활동을 두 가지로 센다. 하나만 쓰면 각각 놓치는 게 있다.
//   당일 = 같은 KST 날짜 안에서 발행보다 **먼저** 일어난 것 → 원고 게이트가 요구하는 값
//   24h  = 발행 **직전 24시간** → 전날 밤 활동처럼 **날짜 경계를 넘는 것**을 놓치지 않는다
//   ⚠️ t-05 가 바로 그 경우다 — 활동은 08-26 22:10~22:17, 발행은 08-27 09:00.
//      「당일」로만 세면 0 이 나오는데 실제로는 11시간 전에 활동이 있었다.
const 선행활동 = (ts) => {
  if (활동조회실패) return null;   // ⛔ 실패했으면 0 이 아니라 물음표를 찍는다
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return null;
  const day = kstDate(ts);
  return {
    당일: events.filter((e) => e < t && kstDayOfMs(e) === day).length,
    h24: events.filter((e) => e < t && e >= t - 86400000).length,
  };
};

// ── 측정 스냅샷 (2026-08-31 신설) ───────────────────────────────────
// 왜: 정착 판정 기준이 「+72h 고정 시점」에서 「24h당 증가율」로 바뀌었다(사용자 결정).
//     증가율은 **이전 측정값**이 있어야 계산된다. 그런데 이 스크립트는 3주 넘게
//     읽고 출력만 하고 아무것도 남기지 않았다 — 그래서 8/30 07:00 예정 판독이
//     그냥 놓쳐졌고, 판독은 매번 사람이 옛 로그를 뒤져 손으로 대조했다.
// ⛔ 기본 저장이다. --no-snapshot 으로만 끈다.
//    플래그를 기억해야 남는 구조면 안 남는다 — 이력이 비면 판정 자체가 불가능하다.
// ★ 여기서 판정하지 않는다. 값만 남긴다. 판정은 check-settled.mjs 가 한다.
const RUN_TS = new Date().toISOString();
const SNAP = [];
const postViews = [];   // 원 게시물 조회 — 아래 「답글 조회」 절에서 분모로 쓴다
for (const t of list.json.data) {
  if (t.media_type === 'REPOST_FACADE') continue;
  const cap = (t.text ?? '').slice(0, 28).replace(/\n/g, ' ');
  const insights = await api(`${TH_BASE}/${t.id}/insights`, {
    metric: 'views,likes,replies,reposts,quotes,shares',
    access_token: token,
  });
  if (!insights.ok) { console.log(`[${kstDate(t.timestamp)} KST] "${cap}" ❌ ${JSON.stringify(insights.json)}`); postViews.push(null); continue; }
  const line = insights.json.data.map(i => `${i.name}=${i.values?.[0]?.value ?? i.total_value?.value}`).join(' · ');
  const vRow = insights.json.data.find((i) => i.name === 'views');
  postViews.push(Number(vRow?.values?.[0]?.value ?? vRow?.total_value?.value ?? NaN));
  SNAP.push({ ts: RUN_TS, surface: 'threads', account: ACCOUNT, id: t.id, published: t.timestamp, caption: cap, views: postViews.at(-1) });
  const a = 선행활동(t.timestamp);
  // ⚠️ 「선행」이라고만 적는다. 「활동 있음/없음」 같은 판정어를 쓰지 않는다 —
  //    판정은 판독할 때 사람이 한다. 스크립트는 센 값만 준다.
  const act = a ? `선행활동  당일 ${a.당일} · 직전24h ${a.h24}` : '선행활동  ?  ⛔ 못 셌다 (0 아님)';
  console.log(`[${kstDate(t.timestamp)} KST] "${cap}"\n  ${line}\n  ${act}`);
}

// ── 아웃바운드 활동 날짜별 합계 (2026-08-27 신설 · 2026-08-28 위치 분리) ────
//
// 왜 세나:
//   2026-08-26 22:10 부터 사람이 **남의 글에 답글·리포스트**를 하기 시작했다.
//   그 직전 두 회차는 조회 3·3 이었고, 그 뒤 두 회차는 44·107 이다.
//   ⛔ 그런데 같은 무렵 **소재도 바뀌었다**(토스 기능 설명 → 자동화·막힘 고백).
//   ★★ 못 가르는 것보다 나쁜 건 **세지도 않는 것**이다. 세어두면 나중에
//      활동이 뜸한 날이 저절로 생겼을 때 그게 자연 실험이 된다.
//
// ⚠️ **이 표는 하루 총계다. 회차 판독에 이걸 쓰지 마라** —
//    발행 전인지 후인지 안 가른다. 회차별 값은 위 각 줄의 `선행활동` 을 본다.
//    ★ 그 구분이 없어서 t-04 가 「활동 있음」으로 잘못 분류됐다(위 주석 참조).
//
// 아래 데이터(`outbound`·`reposts`)는 **위에서 이미 받아왔다.** 여기서 다시 받지 않는다.
const byDay = {};
for (const r of outbound) (byDay[kstDate(r.timestamp)] ??= { rep: 0, rp: 0 }).rep++;
for (const r of reposts) (byDay[kstDate(r.timestamp)] ??= { rep: 0, rp: 0 }).rp++;
const days = Object.keys(byDay).sort().slice(-10);

console.log(`\n── 아웃바운드 활동 (남의 글에 단 답글 · 리포스트) ──`);
console.log(`   누적: 답글 ${outbound.length}건 · 리포스트 ${reposts.length}건`);
if (!days.length) console.log('   기록 없음');
else for (const d of days) console.log(`   ${d} KST   답글 ${String(byDay[d].rep).padStart(3)} · 리포스트 ${String(byDay[d].rp).padStart(3)}`);
console.log('   ⚠️ 이건 **하루 총계라 발행 전/후를 안 가른다.** 회차 판독에는 쓰지 마라.');
console.log('      회차별 값은 위 각 줄의 「선행활동 당일 N · 직전24h M」 을 본다.');
console.log('      ★ 이 구분이 없어서 t-04(08-26 21:00)가 「활동 있음」으로 잘못 분류됐다 —');
console.log('        첫 아웃바운드는 22:10, 발행 70분 뒤였다.');

// ── 답글 조회 (2026-08-28 신설 · `--replies`) ─────────────────────────
//
// ⛔⛔ 왜 만들었나: Threads 공식 크리에이터 페이지(한국어판, 1차)가 이렇게 적는다 —
//   *"다른 사람에게 답글을 다는 것은 원본 콘텐츠를 게시하는 것만큼이나 중요합니다.
//     **Threads 답글은 조회수의 약 절반에 달하며**…"* (각주: 2024 상반기 30일 내부 분석)
//
//   ★★ 그런데 같은 날 우리 실측은 **「아웃바운드 활동 → 도달 상승이 안 보인다」** 였다
//      (본계정 46건, 선행 당일 >0 중앙 57 / 0 중앙 69).
//   ★★★ **둘이 부딪히는 게 아니라 다른 것을 재고 있을 수 있다.**
//      저쪽은 **답글 자체가 받는 조회**를 말하는 것일 수 있고,
//      우리는 **원 게시물 views 만** 쟀다. 그러면 서로 반박이 안 된다.
//   ▶ 그래서 **답글 조회를 따로 센다.** 가르지 않으면 남의 숫자와 우리 숫자를 계속 맞붙인다.
//
// ⚠️ **기본으로 안 켠다** — 답글마다 insights 를 1회씩 부른다(본계정 ~90회).
//    매일 도는 점검이 느려지면 안 켜게 된다. 필요할 때 `--replies` 로 켠다.
if (process.argv.includes('--replies')) {
  const selfReplies = (reps ?? []).filter((r) => (r.root_post?.username ?? '') === me.json.username);
  const 조회 = async (arr, label) => {
    const vals = []; const rows = []; let 실패 = 0;
    for (const r of arr) {
      const ins = await api(`${TH_BASE}/${r.id}/insights`, { metric: 'views', access_token: token });
      const row = ins.ok ? (ins.json.data ?? []).find((i) => i.name === 'views') : null;
      const v = Number(row?.values?.[0]?.value ?? row?.total_value?.value ?? NaN);
      // ⛔ 조회 실패를 0 으로 세지 않는다. 「안 봤다」와 「0 이었다」는 다른 것이다.
      if (Number.isNaN(v)) 실패++; else { vals.push(v); rows.push({ v, r }); }
    }
    return { label, vals, rows, 실패 };
  };
  const mid = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const sum = (a) => a.reduce((s, x) => s + x, 0);

  console.log('\n── 답글 조회 (--replies) ──────────────────────────────');
  const out = await 조회(outbound, '아웃바운드 답글(남의 글)');
  const slf = await 조회(selfReplies, '셀프 답글(내 글 체인)');
  const 원글 = postViews.filter((v) => typeof v === 'number' && !Number.isNaN(v));

  for (const g of [out, slf]) {
    console.log(`   ${g.label.padEnd(22)} ${String(g.vals.length).padStart(3)}건 · 합 ${String(sum(g.vals)).padStart(6)} · 중앙 ${String(mid(g.vals)).padStart(4)} · 최대 ${String(g.vals.length ? Math.max(...g.vals) : 0).padStart(5)}`
      + (g.실패 ? `  ⛔ 조회 실패 ${g.실패}건(0 아님)` : ''));
  }
  console.log(`   ${'원 게시물'.padEnd(22)} ${String(원글.length).padStart(3)}건 · 합 ${String(sum(원글)).padStart(6)} · 중앙 ${String(mid(원글)).padStart(4)} · 최대 ${String(원글.length ? Math.max(...원글) : 0).padStart(5)}`);

  const 답글합 = sum(out.vals) + sum(slf.vals);
  const 전체 = 답글합 + sum(원글);
  const pct = 전체 ? (답글합 / 전체 * 100) : 0;
  console.log(`\n   ▶ 답글이 만든 조회 비중: **${pct.toFixed(1)}%** (답글 ${답글합} / 전체 ${전체})`);
  console.log(`      · 아웃바운드만: ${전체 ? (sum(out.vals) / 전체 * 100).toFixed(1) : '0.0'}%`);
  console.log('   📌 Threads 공식(1차, 한국어판): *"Threads 답글은 조회수의 약 절반에 달하며"*');
  console.log('      각주 — 2024 상반기 글로벌 크리에이터 30일 내부 분석');
  console.log('   ⚠️ **같은 정의인지 우리는 모른다** — 저쪽이 무엇을 분자·분모로 삼았는지 안 적혀 있다.');
  console.log('      숫자를 나란히 놓되 **우열을 말하지 않는다.** 우리 값은 우리 정의의 값이다.');
  console.log('   ⚠️ 조회 범위는 API 창(최근 100건) 안이다 — 계정 전체 누적이 아니다.');

  // ★ 합계만 보면 **꼬리가 만든 값을 평균으로 착각**한다. 상위 3건을 같이 찍는다.
  //   실측(2026-08-28 본계정): 아웃바운드 답글 최대가 **5,754** 로 우리 최고 게시물(3,340)보다 크다.
  //   ⛔ 그러니 「답글이 68%」를 **매 답글이 그렇다**로 읽으면 안 된다 — 중앙은 33 이다.
  const top = [...out.rows].sort((a, b) => b.v - a.v).slice(0, 5);
  if (top.length) {
    console.log('\n   상위 아웃바운드 답글 (꼬리를 보라 — 중앙과 다르다)');
    for (const { v, r } of top) {
      console.log(`     ${String(v).padStart(6)}  ${kstDate(r.timestamp)}  ${r.permalink ?? '(링크 없음)'}`);
    }
    console.log('   ⛔ **어느 글에 달았는지는 API 가 안 준다**(남의 글은 root_post 자체가 안 온다).');
    console.log('      위 링크를 **사람이 열어야** 원글이 보인다. 판정은 코드가 아니라 사람이 한다.');
    console.log('   ⚠️ 그래서 **「내 답글이 좋아서」와 「그 글이 커서」를 우리는 못 가른다.**');
  }
} else {
  console.log('\n   💡 답글이 만든 조회는 안 셌다 — 세려면 `--replies` (답글마다 API 1회, 느리다)');
}

// ── 스냅샷 저장 ──────────────────────────────────────────────
// ⚠️ 마지막에 한 번만 쓴다. 회차마다 append 하면 중간에 죽었을 때 반쪽 측정이 남고,
//    반쪽 측정은 다음 실행에서 「간격은 짧은데 값은 낮은」 가짜 증가율을 만든다.
if (!process.argv.includes('--no-snapshot')) {
  if (SNAP.length) {
    appendFileSync(join(HERE, 'logs', 'insight-snapshots.jsonl'),
      SNAP.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
    console.log(`\n📸 스냅샷 ${SNAP.length}건 저장 — 판정은 \`node check-settled.mjs\``);
  } else {
    console.log('\n⚠️ 스냅샷 0건 — 저장 안 함(회차를 하나도 못 읽었다).');
  }
} else {
  console.log('\n⚠️ --no-snapshot: 측정 이력을 남기지 않았다. 증가율 판정은 이력이 있어야 된다.');
}
