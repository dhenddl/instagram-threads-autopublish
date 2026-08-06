// check-threads-insights.mjs — 스레드 게시물 인사이트 일괄 조회 (읽기 전용, 발행 없음)
// 사용법: node check-threads-insights.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TH_BASE = 'https://graph.threads.net/v1.0';

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

const token = env.THREADS_ACCESS_TOKEN;
const me = await api(`${TH_BASE}/me`, { fields: 'id,username', access_token: token });
console.log(`계정: @${me.json.username}\n`);

const list = await api(`${TH_BASE}/${me.json.id}/threads`, {
  fields: 'id,text,timestamp,media_type,permalink',
  limit: '25',
  access_token: token,
});

for (const t of list.json.data) {
  if (t.media_type === 'REPOST_FACADE') continue;
  const cap = (t.text ?? '').slice(0, 28).replace(/\n/g, ' ');
  const insights = await api(`${TH_BASE}/${t.id}/insights`, {
    metric: 'views,likes,replies,reposts,quotes,shares',
    access_token: token,
  });
  if (!insights.ok) { console.log(`[${t.timestamp?.slice(0,10)}] "${cap}" ❌ ${JSON.stringify(insights.json)}`); continue; }
  const line = insights.json.data.map(i => `${i.name}=${i.values?.[0]?.value ?? i.total_value?.value}`).join(' · ');
  console.log(`[${t.timestamp?.slice(0,10)}] "${cap}"\n  ${line}`);
}
