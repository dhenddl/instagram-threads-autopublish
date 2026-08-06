// check-insights.mjs — 최근 게시물 전체 인사이트 조회 (읽기 전용, 발행 없음)
// 사용법: node check-insights.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IG_BASE = 'https://graph.instagram.com/v23.0';

const env = {};
for (const line of readFileSync(join(HERE, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && m[2].trim()) env[m[1]] = m[2].trim();
}

async function api(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  const json = await res.json();
  return { ok: res.ok, json };
}

const token = env.IG_ACCESS_TOKEN;
const me = await api(`${IG_BASE}/me`, { fields: 'id,username', access_token: token });
console.log(`계정: @${me.json.username}\n`);

const mediaList = await api(`${IG_BASE}/${me.json.id}/media`, {
  fields: 'id,caption,media_type,media_product_type,timestamp,permalink',
  limit: '20',
  access_token: token,
});

// 기본 지표(3주간 검증된 조합) + 확장 지표(2026-08-06 추가, 공식 미디어 레퍼런스 Jun 18 2026)
//
// ⚠️ 표면별로 지원 지표가 다르다 — 잘못 붙이면 호출 전체가 에러가 된다:
//   · profile_visits·follows·profile_activity → FEED(캐러셀·사진)·STORY만. **릴스엔 없다.**
//     (뒤집힌 배치다: 최강 채널인 릴스는 전환 계측이 안 되고 최약체 캐러셀은 된다)
//   · ig_reels_* · reels_skip_rate → 릴스만.
// 그래서 확장 조합을 먼저 시도하고, 실패하면 기본 조합으로 후퇴한다 — 지표 하나 때문에
// 3주간 쓰던 도구가 통째로 죽으면 안 된다. 후퇴했다는 사실은 화면에 남긴다.
const BASE = {
  REELS: 'reach,views,likes,comments,shares,saved,total_interactions',
  CAROUSEL_ALBUM: 'reach,likes,comments,shares,saved,total_interactions',
  IMAGE: 'reach,likes,comments,shares,saved,total_interactions',
};
const EXTRA = {
  REELS: 'ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate',
  CAROUSEL_ALBUM: 'profile_visits,follows',
  IMAGE: 'profile_visits,follows',
};

for (const m of mediaList.json.data) {
  const t = target(m);
  const base = BASE[t] || 'reach,likes,comments';
  const extra = EXTRA[t];
  const cap = (m.caption ?? '').slice(0, 24).replace(/\n/g, ' ');
  console.log(`[${m.timestamp.slice(0, 10)}] [${m.media_type}/${m.media_product_type}] "${cap}"`);

  let insights = await api(`${IG_BASE}/${m.id}/insights`, {
    metric: extra ? `${base},${extra}` : base, access_token: token,
  });
  let degraded = false;
  if (!insights.ok && extra) {
    insights = await api(`${IG_BASE}/${m.id}/insights`, { metric: base, access_token: token });
    degraded = true;
  }
  if (!insights.ok) {
    console.log(`  ❌ 실패: ${JSON.stringify(insights.json.error)}`);
    continue;
  }
  const line = insights.json.data.map(i => `${i.name}=${i.values?.[0]?.value ?? i.total_value?.value}`).join(' · ');
  console.log(`  ${line}`);
  if (degraded) console.log(`  ⚠️ 확장 지표 미지원으로 기본 조합만 조회함 (요청했던 것: ${extra})`);

  // profile_activity는 breakdown=action_type을 함께 보내야 세부가 나오고,
  // ⚠️ breakdown 미지원 지표와 같은 호출에 섞으면 API가 에러를 낸다 → 반드시 분리 호출.
  if (t === 'CAROUSEL_ALBUM' || t === 'IMAGE') {
    const pa = await api(`${IG_BASE}/${m.id}/insights`, {
      metric: 'profile_activity', breakdown: 'action_type', access_token: token,
    });
    if (pa.ok) {
      const b = pa.json.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      const total = pa.json.data?.[0]?.total_value?.value;
      console.log(`  profile_activity=${total ?? 0}${b.length ? ' · ' + b.map(r => `${r.dimension_values.join('/')}=${r.value}`).join(' ') : ''}`);
    }
  }
}

// ⚠️ 버그 수정 (2026-08-06): 기존 구현은 `media_product_type || media_type`을 그대로 키로 썼는데,
// 캐러셀은 media_product_type이 **'FEED'**여서 metricMap['CAROUSEL_ALBUM']에 한 번도 걸리지 않았다.
// → 3주 동안 캐러셀은 폴백인 'reach,likes,comments' 3개만 조회되고 shares·saved·total_interactions가
//   조용히 빠져 있었다. 릴스는 media_product_type이 'REELS'라 우연히 맞아떨어져서 안 드러났다.
// 표면 구분은 릴스/스토리만 media_product_type으로 하고, 나머지는 media_type을 쓴다.
function target(m) {
  const p = m.media_product_type;
  if (p === 'REELS' || p === 'STORY') return p;
  return m.media_type;
}
