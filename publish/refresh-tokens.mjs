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

const original = readFileSync(ENV_PATH, 'utf8');
let envText = original;

for (const { key, url, grant, label } of TARGETS) {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m || !m[1].trim()) { console.log(`[${label}] 토큰 없음 — 건너뜀`); continue; }
  try {
    const res = await fetch(`${url}?grant_type=${grant}&access_token=${m[1].trim()}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(JSON.stringify(json.error ?? json));

    // ⚠️ 200이고 error도 없는데 토큰이 비어 있을 수 있다. 검증 없이 넣으면
    //    .env에 `KEY=undefined`가 박히고 그 순간부터 모든 발행이 죽는다.
    //    "저장 전에 필수 값이 실제로 들어있는지 본다" — 인증 상태를 파일로 쓸 때의 공통 처방.
    const tok = json.access_token;
    if (typeof tok !== 'string' || tok.trim().length < 20) {
      throw new Error(`토큰이 응답에 없거나 형식이 이상함: ${JSON.stringify(json).slice(0, 140)}`);
    }
    // 치환값은 함수로 넘긴다 — 문자열로 주면 토큰 속 `$&` 같은 패턴이 해석된다
    envText = envText.replace(new RegExp(`^${key}=.+$`, 'm'), () => `${key}=${tok.trim()}`);
    console.log(`[${label}] 갱신 완료 — 만료까지 ${Math.round(json.expires_in / 86400)}일`);
  } catch (e) {
    console.error(`[${label}] 갱신 실패: ${e.message}`);
    process.exitCode = 1;
  }
}

if (envText === original) {
  console.log('변경 없음 — .env를 건드리지 않는다');
} else {
  writeFileSync(ENV_PATH, envText);
  console.log('.env 갱신 완료');
}
