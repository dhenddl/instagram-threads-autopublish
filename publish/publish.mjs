// publish.mjs — 카드뉴스 캐러셀을 Instagram + Threads에 발행 (공식 API)
//
// 사용법:
//   node publish.mjs --manifest post.json --dry-run          # 컨테이너 생성까지만 (검수용)
//   node publish.mjs --manifest post.json                    # 실제 발행 (인스타+스레드)
//   node publish.mjs --manifest post.json --target instagram # 한 플랫폼만
//
// manifest(post.json) 형식:
//   {
//     "caption": "인스타 캡션 (해시태그 포함)",
//     "threadsText": "스레드용 텍스트 (최대 500자, 없으면 caption 앞 500자 사용)",
//     "threadsReplies": ["답글1", "답글2"],                      // 선택. 셀프 답글 체인(부모→답글1→답글2 연쇄)
//     "images": ["https://.../01.jpg", "https://.../02.jpg"],   // 공개 URL, JPEG만
//     "alts": ["1번 대체텍스트", "2번 대체텍스트", ...],          // 선택. 이미지와 같은 순서. SEO+접근성
//     "isAiGenerated": true,                                    // 선택. 인스타 캐러셀에 AI 라벨을 켠다(기본 false)
//     "targets": ["instagram", "threads"]
//   }
//
// ⚠️ isAiGenerated는 **인스타 캐러셀 전용**이다.
//   · 릴스에는 적용되지 않는다 — 우리 릴스는 API 발행이 아니라 **폰 앱 수동 업로드**이고,
//     릴스 라벨은 앱의 `Add AI label` 토글로 켠다. 켠 결과는 `check-ai-label.mjs`로 검증한다.
//   · 스레드는 미적용 — 공식 문서가 확인된 건 Instagram 쪽뿐이라 검증 없이 넣지 않는다.
//
// 전제: .env에 IG_ACCESS_TOKEN / THREADS_ACCESS_TOKEN (장기 토큰).
// ⚠️ 첫 실행 전 미검증 스켈레톤 — 토큰 발급 후 dry-run으로 반드시 먼저 확인할 것.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IG_BASE = 'https://graph.instagram.com/v23.0';
const TH_BASE = 'https://graph.threads.net/v1.0';

// ---------- 공통 유틸 ----------
function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(HERE, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[2].trim()) env[m[1]] = m[2].trim();
  }
  return env;
}

function parseArgs() {
  const args = { dryRun: false, target: null, manifest: null, force: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--target') args.target = argv[++i];
    else if (argv[i] === '--manifest') args.manifest = argv[++i];
    else if (argv[i] === '--force') args.force = true;      // 24시간 중복 검사 통과(의도한 재발행)
  }
  if (!args.manifest) { console.error('사용법: node publish.mjs --manifest post.json [--dry-run] [--target instagram|threads] [--force]'); process.exit(1); }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Meta의 일시(is_transient) 오류는 자동 재시도
async function api(method, url, params, retries = 3) {
  const qs = new URLSearchParams(params);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(method === 'GET' ? `${url}?${qs}` : url, method === 'GET' ? {} : { method, body: qs });
    const json = await res.json();
    if (res.ok && !json.error) return json;
    const err = json.error ?? json;
    if (err.is_transient && attempt <= retries) {
      console.log(`  ↻ 일시 오류 재시도 ${attempt}/${retries} (3초 대기): ${err.message ?? ''}`);
      await sleep(3000);
      continue;
    }
    throw new Error(`${url} 실패: ${JSON.stringify(err)}`);
  }
}

// 컨테이너 처리 완료 대기 (이미지 fetch·검증에 시간이 걸림)
// 상태 필드가 인스타(status_code)와 스레드(status)에서 다르므로 field로 구분
async function waitReady(base, containerId, token, label, field = 'status_code') {
  for (let i = 0; i < 60; i++) {
    const r = await api('GET', `${base}/${containerId}`, { fields: field, access_token: token });
    const st = r[field];
    if (st === 'FINISHED') return;
    if (st === 'ERROR' || st === 'EXPIRED') throw new Error(`${label} 컨테이너 처리 실패 (${containerId}): ${st}`);
    await sleep(2000);
  }
  throw new Error(`${label} 컨테이너 대기 시간 초과 (${containerId})`);
}

// ---------- 멱등성: "오류 응답 ≠ 미발행" 판별 ----------
// ⚠️ 이건 사고가 아니라 이 계정 캐러셀 발행의 **정상 상태**다.
//    media_publish가 오류를 반환했는데 서버 쪽 쓰기는 커밋돼 실제로는 게시된다.
//    로그 전수 대조(2026-08-07): **캐러셀 발행 11건 중 9건이 code 4**였다.
//    깨끗했던 건 07-21(첫 발행)과 08-03 둘뿐이고, 08-03이 왜 안 났는지는 설명 못 한다.
//    07-22엔 "사람이 계정에서 확인할 것"이라는 주석만 남겼고 08-04에 똑같이 재발했다 —
//    사람 절차로는 못 막으니 코드로 확인한다. 확인 없이 재발행하면 같은 글이 두 번 올라간다.
const publishKey = (s) => (s ?? '').replace(/\s+/g, '').slice(0, 40);

// 이 스크립트가 인스타에 만드는 건 **항상 피드 캐러셀**(media_product_type=FEED)이다.
// 릴스는 트렌드 오디오 때문에 폰 앱 수동 업로드라 여기서 만들지 않는다.
// ⚠️ 2026-08-07 사고: 같은 캡션의 **릴스가 7분 먼저** 올라가자 가드가 그걸 "이미 올라간 캐러셀"로
//    보고 캐러셀 발행을 막았다(3형식 전략상 캡션 앞 40자는 세 표면이 동일하다).
//    더 위험한 쪽은 반대 경로였다 — media_publish가 진짜로 실패했을 때 아래 함수가 릴스를 집으면
//    "거짓 실패, 이미 게시됨 ⛔재발행 금지"로 판정해 **캐러셀이 영영 안 올라가고 exit 0**이 된다.
//    (07-22·08-04·08-05·08-06·08-07 전부 이 함수가 판정을 맡았다. 08-07엔 캐러셀이 릴스보다
//     최신이라 우연히 맞는 걸 집었을 뿐이다.)
const OUR_IG_SURFACE = 'FEED';

// 반환: 게시물 객체(=게시됨) | null(=미발행 확인) | undefined(=확인 자체 실패)
// windowMs — 오류 후 판정은 짧게(직후 몇 초), 발행 전 중복 검사는 길게(하루)
async function findRecentPost(target, userId, token, text, windowMs = 15 * 60 * 1000) {
  const key = publishKey(text);
  if (!key) return undefined;                       // 비교 기준이 없으면 판정 불가
  const [base, edge, field, fields] = target === 'instagram'
    ? [IG_BASE, 'media', 'caption', 'id,timestamp,caption,media_product_type']
    : [TH_BASE, 'threads', 'text', 'id,timestamp,text'];
  try {
    // 재시도 없이 1회만 — 이미 한도에 걸린 상태일 수 있어 추가 호출을 최소화
    const r = await api('GET', `${base}/${userId}/${edge}`, { fields, limit: '10', access_token: token }, 0);
    const cutoff = Date.now() - windowMs;
    for (const p of r.data ?? []) {
      if (new Date(p.timestamp).getTime() < cutoff) continue;
      if (!publishKey(p[field]).startsWith(key)) continue;
      // ⚠️ 표면이 **다른 것으로 확인될 때만** 거른다. 필드가 비면 거르지 않고 그대로 비교한다 —
      //    못 걸러서 중복 게시하는 쪽이 과잉 차단보다 나쁘다(위험 방향으로 열지 않는다).
      if (target === 'instagram' && p.media_product_type && p.media_product_type !== OUR_IG_SURFACE) {
        console.log(`  ℹ️ 같은 캡션이지만 표면이 다름 — 건너뜀: ${p.media_product_type} id=${p.id} (${p.timestamp})`);
        continue;
      }
      return p;
    }
    return null;
  } catch (e) {
    console.error(`  ⚠️ 발행 여부 확인 실패(${target}): ${e.message}`);
    return undefined;
  }
}

// 발행 전 중복 검사 — 오류 판정만으로는 부족하다.
// 07-22·08-04처럼 "오류가 났지만 실제로는 게시된" 뒤 사람이 --target으로 재실행하면
// 사전 검사가 없으면 그대로 중복 게시된다. 하루 안에 같은 캡션이 있으면 발행을 멈춘다.
// 의도적 재발행이 필요하면 --force 로 통과시킨다.
async function assertNotAlreadyPublished(target, label, userId, token, text, force) {
  const dup = await findRecentPost(target, userId, token, text, 24 * 60 * 60 * 1000);
  // ⚠️ 이 검사의 사각지대 — 초록불이 "안전"을 뜻하지 않는 지점들 (《몰라서 만들었다》 6장의 질문 적용):
  //   ① 조회가 실패하면(undefined) 중복을 못 보고 통과시킨다 = 위험 방향으로 열린다.
  //      막지는 않는다(조회 한 번 실패로 매일 예약 발행이 멈추면 그게 더 큰 손해) — 대신 반드시 소리를 낸다.
  //      조용한 통과가 이 사고의 원래 형태였다.
  //   ② limit 10 — 하루 11건 이상 올리면 대상이 조회 범위를 벗어난다(현재 1~2건이라 여유).
  //   ③ 캡션 앞 40자로만 비교 — 매 편 첫 40자가 달라야 한다. 같으면 오차단, 다르면 중복 통과.
  //      ✏️ 2026-08-08 부분 해소: **표면이 다르면 안 막는다**(findRecentPost의 media_product_type 필터).
  //         08-07 오차단은 릴스 대 캐러셀이라 이걸로 닫혔다. 다만 **같은 표면끼리의 40자 한계는 그대로**다 —
  //         같은 날 캐러셀 두 편의 첫 40자가 같으면 여전히 뒤엣것이 막힌다(현재 하루 1편이라 미발생).
  //   ④ 24시간 창 — 그 이후 재실행은 통과한다.
  if (dup === undefined) {
    console.error(`[${label}] ⚠️ 중복 검사를 수행하지 못했습니다 — 중복 게시 가능성을 배제하지 못한 상태로 발행을 진행합니다.`);
    console.error(`[${label}]    발행 후 계정에서 같은 글이 두 번 올라갔는지 확인할 것.`);
    return;
  }
  if (!dup) return;                                 // null = 미발행 확인 → 정상 진행
  if (force) { console.log(`[${label}] ⚠️ 24시간 내 동일 캡션 발견(${dup.id})이지만 --force 로 계속 진행`); return; }
  const e = new Error(`24시간 내 동일 내용이 이미 게시돼 있음 — id=${dup.id} (${dup.timestamp}). 중복 방지로 발행 중단. 의도한 재발행이면 --force`);
  e.alreadyPublished = true;
  throw e;
}

// 발행 호출을 감싸 "오류 → 실물 확인 → 판정" 순서를 강제한다.
async function publishOrVerify({ target, label, userId, token, text, doPublish }) {
  try {
    return { ...(await doPublish()), published: true };
  } catch (e) {
    console.error(`[${label}] 발행 호출 오류: ${e.message}`);
    const found = await findRecentPost(target, userId, token, text);
    if (found) {
      console.log(`[${label}] ✅ 그런데 실물 확인 결과 게시됨 — id=${found.id} (${found.timestamp}) · 오류 응답은 거짓 실패`);
      console.log(`[${label}] ⛔ 재발행 금지 — 재실행하면 같은 글이 중복 게시된다`);
      return { id: found.id, published: true, falseAlarm: true };
    }
    if (found === null) { console.error(`[${label}] 실물 확인 결과 미발행 — 진짜 실패`); throw e; }
    const err = new Error(`${e.message} (발행 여부 확인 불가)`);
    err.unverified = true;                          // 재발행 안내를 내보내지 않기 위한 표시
    throw err;
  }
}

// ---------- Instagram 캐러셀 ----------
async function publishInstagram({ images, caption, alts, isAiGenerated }, token, dryRun, force) {
  const { id: userId, username } = await api('GET', `${IG_BASE}/me`, { fields: 'id,username', access_token: token });
  console.log(`[IG] 계정 확인: @${username} (${userId})`);

  // 컨테이너를 만들기 전에 중복부터 확인한다 — 이미 올라간 글이면 API 호출 자체가 낭비다
  if (!dryRun) await assertNotAlreadyPublished('instagram', 'IG', userId, token, caption, force);

  const children = [];
  for (const [i, url] of images.entries()) {
    // 확장자로 이미지/영상 구분 — 움직이는 캐러셀처럼 이미지+영상이 섞인 캐러셀 지원
    const isVideo = /\.mp4(\?|$)/i.test(url);
    const params = isVideo
      ? { media_type: 'VIDEO', video_url: url, is_carousel_item: 'true', access_token: token }
      : { image_url: url, is_carousel_item: 'true', access_token: token };
    const alt = alts?.[i];
    if (alt && !isVideo) params.alt_text = alt;   // 대체텍스트(SEO+접근성). VIDEO 캐러셀 아이템은 미지원(2026-07-24 실측: alt_text 파라미터 에러)
    const { id } = await api('POST', `${IG_BASE}/${userId}/media`, params);
    children.push(id);
    console.log(`[IG] 아이템 ${i + 1}/${images.length} 컨테이너(${isVideo ? '영상' : '이미지'}): ${id}${alt && !isVideo ? ' (alt ✓)' : ''}`);
  }
  // 자식 컨테이너가 전부 FINISHED 된 뒤에 캐러셀로 묶는다 (미완료 자식 참조 방지)
  for (const [i, id] of children.entries()) await waitReady(IG_BASE, id, token, `IG 아이템 ${i + 1}`, 'status_code');
  const parentParams = {
    media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token,
  };
  // ⚠️ 라벨은 **부모 컨테이너에만** 붙인다. 공식 문서가 명시: "Setting this parameter on
  // carousel children will result in an error." 위 자식 루프에는 절대 넣지 말 것.
  if (isAiGenerated) parentParams.is_ai_generated = 'true';
  const { id: carouselId } = await api('POST', `${IG_BASE}/${userId}/media`, parentParams);
  await waitReady(IG_BASE, carouselId, token, 'IG');
  console.log(`[IG] 캐러셀 컨테이너 준비 완료: ${carouselId}${isAiGenerated ? ' (AI 라벨 요청함)' : ''}`);

  if (dryRun) {
    if (isAiGenerated) console.log('[IG] --dry-run: AI 라벨을 부모 컨테이너에만 설정함 — 실제 반영 여부는 발행 후 GET으로만 확인 가능');
    console.log('[IG] --dry-run: 발행 직전 정지. 검수 후 재실행하세요.');
    return { carouselId, published: false };
  }
  const r = await publishOrVerify({
    target: 'instagram', label: 'IG', userId, token, text: caption,
    doPublish: async () => {
      const { id } = await api('POST', `${IG_BASE}/${userId}/media_publish`, { creation_id: carouselId, access_token: token });
      console.log(`[IG] 🚀 발행 완료: media_id=${id}`);
      return { id };
    },
  });

  // 라벨을 켰다면 실물을 다시 읽는다 — 요청에 파라미터를 넣은 것과 라벨이 실제로 붙은 것은 다르다.
  // (2026-08-07에만 "성공 응답 ≠ 원하는 상태"가 여덟 번 재현됐다.)
  // ⚠️ 검증 실패로 예외를 던지지 않는다 — 이 시점엔 이미 발행이 끝났고, 여기서 터지면
  //    호출부가 발행 실패로 오인해 재발행을 권하게 된다(07-22·08-04 중복 게시 사고의 형태).
  if (isAiGenerated && r.id) {
    try {
      const v = await api('GET', `${IG_BASE}/${r.id}`, { fields: 'is_ai_generated', access_token: token });
      if (v.is_ai_generated === true) console.log(`[IG] ✅ AI 라벨 실물 확인: is_ai_generated=true`);
      else console.error(`[IG] ⚠️ AI 라벨 요청했으나 실물은 is_ai_generated=${JSON.stringify(v.is_ai_generated)} — 앱에서 직접 확인할 것`);
    } catch (e) {
      console.error(`[IG] ⚠️ AI 라벨 검증 조회 실패(발행 자체는 완료됨): ${e.message}`);
    }
  }
  return { mediaId: r.id, published: true, falseAlarm: r.falseAlarm };
}

// ---------- Threads 셀프 답글 체인 ----------
// 부모→답글1→답글2로 **연쇄**시킨다(전부 부모에 붙이면 형제 나열이 되고, 연쇄하면 시리즈로 렌더링됨).
// 발행 직후 즉시 붙이는 게 중요하다 — 피드 노출이 시작될 때 이미 답글이 있어야 첫 시청자부터 유입된다.
// (2026-07-30·07-31 셀프 답글은 4분·11분 늦었고 통과율 2.8%로 끝났다 → topics/스레드 답글 레버)
// ⚠️ 2026-08-09 사고: 본편은 나갔는데 답글 2개가 통째로 실패했다.
//   `code 24 / subcode 4279009` — "ID가 …인 미디어를 찾을 수 없습니다".
//   그런데 waitReady로 **FINISHED를 확인한 직후**의 컨테이너였고, 29분 뒤 조회해도 FINISHED로 살아 있었다.
//   ★ 재시도가 안 된 이유: api()의 재시도 조건이 `err.is_transient`뿐인데 메타가 이걸 **false**로 줬다.
//   그런데 29분 뒤 같은 절차가 **재시도 없이 한 번에** 성공했다 → **일시적 오류였는데 영구로 자기신고한 것**이다.
//   → 이 단계만 `is_transient`와 무관하게 재시도한다. 08-05·06·07·08은 전부 성공했고 09만 났다(간헐성).
//
// ⛔ 단 블라인드 재시도는 금지다 — publish 응답만 잃고 실제로는 붙었을 수 있고, 그러면 답글이 중복된다.
//   (07-22·08-04·08-05·08-06·08-07 캐러셀에서 반복 확인된 "오류 응답 ≠ 미발행" 패턴이 여기도 적용된다.)
//   그래서 **재시도 전에 부모 대화를 조회해 실물부터 본다.**
async function findPublishedReply(rootId, token, text) {
  const key = publishKey(text);
  if (!key) return undefined;
  try {
    const r = await api('GET', `${TH_BASE}/${rootId}/conversation`, { fields: 'id,text', access_token: token }, 0);
    return (r.data ?? []).find((p) => publishKey(p.text).startsWith(key))?.id ?? null;
  } catch (e) {
    console.error(`  ⚠️ 답글 실물 확인 실패: ${e.message}`);
    return undefined;                               // 확인 자체 실패 = 판정 불가
  }
}

async function publishThreadReplies(userId, token, replies, parentId, dryRun) {
  const ids = [];
  const rootId = parentId;                          // 실물 확인은 항상 본편 대화에서 한다(체인이라 prev는 바뀐다)
  let prev = parentId;
  for (const [i, text] of replies.entries()) {
    const label = `답글 ${i + 1}/${replies.length}`;
    if (dryRun) {
      console.log(`[TH] --dry-run ${label} → reply_to_id=${prev} : "${text.slice(0, 36).replace(/\n/g, ' ')}…"`);
      prev = `(${label} id)`;                       // 체인 구조가 눈에 보이도록 자리표시
      continue;
    }
    const { id: cid } = await api('POST', `${TH_BASE}/${userId}/threads`, {
      media_type: 'TEXT', text, reply_to_id: prev, access_token: token,
    });
    await waitReady(TH_BASE, cid, token, `TH ${label}`, 'status');

    let id = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // retries=0 — 재시도는 이 루프가 통제한다(api() 내부 재시도와 이중으로 겹치지 않게)
        ({ id } = await api('POST', `${TH_BASE}/${userId}/threads_publish`, { creation_id: cid, access_token: token }, 0));
        break;
      } catch (e) {
        const already = await findPublishedReply(rootId, token, text);
        if (already) {                              // 오류 응답인데 실제로는 붙었다 → 재시도하면 중복
          console.log(`[TH] ↳ ${label} ✅ 오류 응답이었으나 실물 확인됨: ${already} · 재시도 안 함`);
          id = already;
          break;
        }
        if (already === undefined) throw e;          // 확인 실패 = 중복 위험 배제 못 함 → 재시도 금지
        if (attempt === 3) throw e;                  // 미발행 확정인 채로 3회 소진
        console.log(`  ↻ ${label} publish 재시도 ${attempt}/2 (4초 대기) — 실물 미발행 확인됨: ${e.message.slice(0, 90)}`);
        await sleep(4000);
      }
    }
    console.log(`[TH] ↳ ${label} 발행: ${id} (reply_to=${prev})`);
    ids.push(id);
    prev = id;
  }
  return ids;
}

// ---------- Threads (텍스트 전용 또는 이미지 캐러셀) ----------
async function publishThreads({ images, text, textOnly, replies }, token, dryRun, force) {
  const { id: userId, username } = await api('GET', `${TH_BASE}/me`, { fields: 'id,username', access_token: token });
  console.log(`[TH] 계정 확인: @${username} (${userId})`);

  // 컨테이너를 만들기 전에 중복부터 확인한다 (인스타와 동일 규칙)
  if (!dryRun) await assertNotAlreadyPublished('threads', 'TH', userId, token, text, force);

  let creationId;
  if (textOnly) {
    // 텍스트 전용 포스트 (media_type=TEXT) — 스레드는 텍스트 우선 플랫폼
    const { id } = await api('POST', `${TH_BASE}/${userId}/threads`, { media_type: 'TEXT', text, access_token: token });
    creationId = id;
    console.log(`[TH] 텍스트 컨테이너 생성: ${id}`);
  } else {
    const children = [];
    for (const [i, url] of images.entries()) {
      // 확장자로 이미지/영상 구분 (인스타와 동일 규칙)
      const isVideo = /\.mp4(\?|$)/i.test(url);
      const params = isVideo
        ? { media_type: 'VIDEO', video_url: url, is_carousel_item: 'true', access_token: token }
        : { media_type: 'IMAGE', image_url: url, is_carousel_item: 'true', access_token: token };
      const { id } = await api('POST', `${TH_BASE}/${userId}/threads`, params);
      children.push(id);
      console.log(`[TH] 아이템 ${i + 1}/${images.length} 컨테이너(${isVideo ? '영상' : '이미지'}): ${id}`);
    }
    // 스레드는 자식이 FINISHED 되기 전에 묶으면 "하위 요소 무효" 오류 → 전부 완료 대기 (필드명 status)
    for (const [i, id] of children.entries()) await waitReady(TH_BASE, id, token, `TH 아이템 ${i + 1}`, 'status');
    const { id: carouselId } = await api('POST', `${TH_BASE}/${userId}/threads`, {
      media_type: 'CAROUSEL', children: children.join(','), text, access_token: token,
    });
    creationId = carouselId;
  }
  await waitReady(TH_BASE, creationId, token, 'TH', 'status');
  console.log(`[TH] 컨테이너 준비 완료: ${creationId}`);

  if (dryRun) {
    console.log('[TH] --dry-run: 발행 직전 정지. 검수 후 재실행하세요.');
    if (replies?.length) await publishThreadReplies(userId, token, replies, '(부모 post_id)', true);
    return { creationId, published: false };
  }
  const r = await publishOrVerify({
    target: 'threads', label: 'TH', userId, token, text,
    doPublish: async () => {
      const { id } = await api('POST', `${TH_BASE}/${userId}/threads_publish`, { creation_id: creationId, access_token: token });
      console.log(`[TH] 🚀 발행 완료: post_id=${id}`);
      return { id };
    },
  });

  // 셀프 답글은 부모 발행이 확정된 뒤에만 붙인다(거짓 실패로 확인된 경우도 부모 id가 있으니 진행 가능).
  // 답글 실패가 본편 발행을 실패로 만들지 않도록 격리한다 — 본편이 나간 게 더 중요하다.
  let replyIds = [];
  if (replies?.length) {
    try {
      replyIds = await publishThreadReplies(userId, token, replies, r.id, false);
    } catch (e) {
      console.error(`[TH] ⚠️ 셀프 답글 체인 실패(본편은 정상 발행됨): ${e.message}`);
      console.error('[TH]    → 남은 답글은 앱에서 수동으로 달거나, 본편을 재발행하지 말고 답글만 다시 시도할 것');
    }
  }
  return { postId: r.id, published: true, falseAlarm: r.falseAlarm, replyIds };
}

// ---------- main ----------
const args = parseArgs();
const env = loadEnv();
const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
const targets = args.target ? [args.target] : (manifest.targets ?? ['instagram']);

// 이미지는 인스타 발행 또는 스레드 이미지 캐러셀에만 필요 — 스레드 텍스트 전용 발행은 이미지 없이도 가능
const needsImages = targets.includes('instagram') || (targets.includes('threads') && manifest.threadsTextOnly !== true);
if (needsImages && !manifest.images?.length) throw new Error('manifest.images가 비어 있음 (인스타 또는 이미지 캐러셀 스레드 발행엔 이미지 필수)');
if (manifest.images?.length > 10 && targets.includes('instagram')) throw new Error('인스타 캐러셀은 최대 10장');
if (manifest.images?.some((u) => !/^https:\/\//.test(u))) throw new Error('이미지는 공개 https URL이어야 함');

// AI 라벨 플래그 검증 — 조용히 무시되는 게 최악이다.
// 오타(`isAIGenerated`)나 문자열 "true"를 넣으면 라벨이 안 켜지는데 에러도 안 나서,
// 의무 대상 회차에 라벨 없이 나갈 수 있다. 실행 전에 막는다.
// (08-07 노션 편집 API가 정확히 이 형태였다 — 오타로 매칭 실패했는데 성공을 반환했다.)
for (const k of Object.keys(manifest)) {
  if (k !== 'isAiGenerated' && k.toLowerCase() === 'isaigenerated') {
    throw new Error(`manifest 키 오타: "${k}" → "isAiGenerated" (이대로면 라벨이 조용히 안 켜진다)`);
  }
}
if (manifest.isAiGenerated !== undefined && typeof manifest.isAiGenerated !== 'boolean') {
  throw new Error(`isAiGenerated는 boolean이어야 함 (받은 값: ${JSON.stringify(manifest.isAiGenerated)})`);
}
if (manifest.isAiGenerated === true && !targets.includes('instagram')) {
  console.log('⚠️ isAiGenerated=true인데 instagram이 타깃에 없다 — 이 플래그는 인스타 캐러셀에만 적용된다.');
}

// 셀프 답글 체인 검증 — 발행 도중 터지면 본편만 나가고 체인이 끊기므로 실행 전에 막는다
if (manifest.threadsReplies !== undefined) {
  if (!Array.isArray(manifest.threadsReplies)) throw new Error('threadsReplies는 배열이어야 함');
  manifest.threadsReplies.forEach((t, i) => {
    if (typeof t !== 'string' || !t.trim()) throw new Error(`threadsReplies[${i}]가 빈 문자열`);
    if (t.length > 500) throw new Error(`threadsReplies[${i}] 500자 초과 (${t.length}자)`);
  });
}

// 타깃 격리: 한 플랫폼 실패가 다음 플랫폼 발행을 막지 않는다
// (2026-07-22 팁2 사고: IG media_publish가 에러 응답 후 스크립트 중단 → 스레드 미발행.
//  단, 실제론 IG 발행 성공 — 에러 시 재시도 전에 반드시 계정에서 발행 여부 확인할 것)
const failures = [];        // 실물 확인으로 미발행이 확정된 타깃 — 재발행해도 안전
const unverified = [];      // 발행 여부를 확인조차 못 한 타깃 — 재발행하면 중복 위험
const falseAlarms = [];     // 오류를 반환했지만 실제로는 게시된 타깃
const alreadyUp = [];       // 발행 전 중복 검사에서 막힌 타깃 — 이미 올라가 있음
for (const target of targets) {
  try {
    let r;
    if (target === 'instagram') {
      if (!env.IG_ACCESS_TOKEN) throw new Error('.env에 IG_ACCESS_TOKEN 없음');
      r = await publishInstagram({
        images: manifest.images, caption: manifest.caption ?? '', alts: manifest.alts,
        isAiGenerated: manifest.isAiGenerated === true,
      }, env.IG_ACCESS_TOKEN, args.dryRun, args.force);
    } else if (target === 'threads') {
      if (!env.THREADS_ACCESS_TOKEN) throw new Error('.env에 THREADS_ACCESS_TOKEN 없음');
      const text = manifest.threadsText ?? (manifest.caption ?? '').slice(0, 500);
      r = await publishThreads({
        images: (manifest.images ?? []).slice(0, 20), text,
        textOnly: manifest.threadsTextOnly === true, replies: manifest.threadsReplies,
      }, env.THREADS_ACCESS_TOKEN, args.dryRun, args.force);
    } else {
      throw new Error(`알 수 없는 target: ${target}`);
    }
    if (r?.falseAlarm) falseAlarms.push(target);
  } catch (e) {
    if (e.alreadyPublished) { alreadyUp.push(target); console.error(`[${target}] ⏭ 건너뜀: ${e.message}`); }
    else { (e.unverified ? unverified : failures).push(target); console.error(`[${target}] ❌ ${e.unverified ? '판정 불가' : '실패'}: ${e.message}`); }
  }
}

// ⚠️ 재발행 안내는 "미발행이 확인된" 타깃에만 낸다.
// 07-22·08-04 사고의 교훈: 무조건 재발행을 권하는 안내문이 중복 게시의 직접 원인이 된다.
if (falseAlarms.length) {
  console.log(`✅ 오류 응답이었지만 실제 게시 확인: ${falseAlarms.join(', ')} — ⛔재발행 금지(중복 게시됨)`);
}
if (alreadyUp.length) {
  console.log(`⏭ 이미 게시돼 있어 건너뜀: ${alreadyUp.join(', ')} — 중복 방지 정상 작동. 진짜 재발행이 필요하면 --force`);
}
if (unverified.length) {
  console.error(`❓ 발행 여부 확인 불가: ${unverified.join(', ')} — ⛔자동 재발행 금지.`);
  console.error('   앱/계정에서 실제 게시 여부를 눈으로 확인한 뒤에만 재실행할 것.');
}
if (failures.length) {
  console.error(`⚠️ 미발행 확인된 타깃: ${failures.join(', ')} — --target ${failures[0]} 로 재발행 가능(중복 위험 없음)`);
}
if (failures.length || unverified.length) process.exit(1);
