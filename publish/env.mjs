// .env 로더 — 한 곳 (2026-08-26 신설)
//
// ── 왜 모았나 ───────────────────────────────────────────────────
// 종전에는 **일곱 개 파일이 각자 같은 파서를 복사해서** 갖고 있었다.
// 2026-08-25 에 그 파서에서 버그를 찾았는데(커밋 `ec6647c`), 고칠 자리가 일곱이었다.
//
// ⛔ 그 버그: 정규식이 `/^([A-Z_]+)=(.*)$/` 라 **키 이름에 숫자를 못 받았다.**
//    `IG_ACCESS_TOKEN_2` · `THREADS_ACCESS_TOKEN_2` 가 **조용히 안 읽혔다** —
//    없는 게 아니라 파서가 그 줄을 건너뛰었다.
//    ★★ 2계정 키가 정확히 그 형태다. **계정을 늘린 날 이 버그가 살아 있었다.**
//
// ★★★ 그리고 일곱 곳을 고쳤는데도 **공개 1호 저장소에는 네 개가 옛 버전으로 남았다**
//    (`52aac50` 그대로). 버그가 하나인데 고칠 자리가 여덟이면 **반드시 몇 개는 안 고쳐진다.**
//    이 볼트가 반복해서 데인 축이다 — 「같은 사실이 두 곳에 있으면 한 곳만 고쳐진다」.
//
// ── 동작 ────────────────────────────────────────────────────────
// 종전 파서와 **바이트 단위로 같은 결과**를 낸다. 옮기면서 동작을 바꾸지 않았다.
//   · `KEY=값` 만 읽는다. 키는 영문 대문자로 시작하고 숫자·밑줄을 포함할 수 있다.
//   · 값의 앞뒤 공백은 떼고, **떼고 나서 빈 값이면 없는 것으로 친다.**
//     (`.env` 의 `IG_APP_ID=` 처럼 자리만 있는 줄이 실제로 있다)
//   · `#` 주석·따옴표 처리는 **하지 않는다.** 지금 `.env` 에 그런 줄이 없고,
//     여기서 새 규칙을 넣으면 옮기는 김에 동작이 바뀐다.
//
// ⚠️ 이 파일은 값을 **절대 출력하지 않는다.** 실패해도 키 이름까지만 말한다.
//
// 사용:
//   import { loadEnv } from './env.mjs';
//   const env = loadEnv(HERE);
//   const env = loadEnv(HERE, { required: ['THREADS_ACCESS_TOKEN'] });

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LINE = /^([A-Z_][A-Z0-9_]*)=(.*)$/;

/**
 * @param {string} dir      .env 가 있는 디렉터리
 * @param {{required?: string[], file?: string}} [opts]
 * @returns {Record<string,string>}
 */
export function loadEnv(dir, opts = {}) {
  const file = opts.file ?? '.env';
  const path = join(dir, file);

  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    // 경로만 말한다. 내용은 말하지 않는다.
    throw new Error(`.env 를 읽을 수 없다: ${path} (${e.code ?? e.message})`);
  }

  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(LINE);
    if (m && m[2].trim()) env[m[1]] = m[2].trim();
  }

  // ★ 없는 키를 나중에 undefined 로 만나면 엉뚱한 데서 죽는다.
  //   check-threads-insights.mjs 가 정확히 그래서 `@undefined` 를 찍었다(2026-08-26).
  const missing = (opts.required ?? []).filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`.env 에 없거나 비어 있다: ${missing.join(', ')} (${path})`);
  }

  return env;
}
