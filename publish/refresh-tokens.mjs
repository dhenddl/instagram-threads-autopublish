// refresh-tokens.mjs — 장기 토큰(60일) 갱신. 30~45일 주기로 실행 (스케줄 등록 예정)
// 사용법: node refresh-tokens.mjs
// 갱신 성공 시 .env를 새 토큰으로 덮어쓴다. ⚠️ 발급 후 24시간 지나야 갱신 가능.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), '.env');

const TARGETS = [
  { key: 'IG_ACCESS_TOKEN', url: 'https://graph.instagram.com/refresh_access_token', grant: 'ig_refresh_token', label: 'Instagram' },
  { key: 'THREADS_ACCESS_TOKEN', url: 'https://graph.threads.net/refresh_access_token', grant: 'th_refresh_token', label: 'Threads' },
];

let envText = readFileSync(ENV_PATH, 'utf8');

for (const { key, url, grant, label } of TARGETS) {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m || !m[1].trim()) { console.log(`[${label}] 토큰 없음 — 건너뜀`); continue; }
  try {
    const res = await fetch(`${url}?grant_type=${grant}&access_token=${m[1].trim()}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(JSON.stringify(json.error ?? json));
    envText = envText.replace(new RegExp(`^${key}=.+$`, 'm'), `${key}=${json.access_token}`);
    console.log(`[${label}] 갱신 완료 — 만료까지 ${Math.round(json.expires_in / 86400)}일`);
  } catch (e) {
    console.error(`[${label}] 갱신 실패: ${e.message}`);
    process.exitCode = 1;
  }
}

writeFileSync(ENV_PATH, envText);
