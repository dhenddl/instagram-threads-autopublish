// inspect.mjs — 렌더한 결과를 다시 보는 단계. 2026-08-10 신설.
//
// 왜 만들었나: 파이프라인이 `JSON → HTML → 스크린샷 → 저장 → 끝`으로 끝나서
// **만든 걸 다시 열어보는 단계가 없었다.** 7/28 주에 카드 41장 중 3장이 깨진 채
// 발행 직전까지 갔고, 잡은 건 사람 눈이었다.
//
// ⚠️ 이 검사가 잡는 것과 못 잡는 것을 분명히 해둔다:
//   ✅ ① 넘침(세로 잘림·가로 잘림·여백 침범)  — 판정이 기하학이라 명확하다
//   ⚠️ ② 고아 줄(마지막 한 글자가 혼자 떨어짐) — 임계값 휴리스틱이라 **경고만** 낸다
//   ❌ ③ 색이 뜻과 반대(강조하면 안 될 행에 초록) — **못 잡는다. 사람이 봐야 한다.**
//
// 원래 계획은 *"렌더된 이미지의 아래쪽 여백 띠에 픽셀이 찍혀 있으면 경고"*였는데,
// 픽셀 대신 DOM 기하를 재는 쪽으로 갔다. 어느 요소가 얼마나 넘쳤는지까지 나오고
// **가로 넘침처럼 픽셀로는 안 보이는 것**(요소 안에서 잘리는 경우)도 잡힌다.

const TOL = 0.5;          // 서브픽셀 오차 허용
// 마지막 줄 폭이 글자 이 개수보다 좁으면 고아로 본다.
// 2.2로 잡았더니 발행분 22개 중 12개가 걸렸다 — 대부분 "마지막 줄에 2글자"라
// 고아라고 부를 게 아니었다. EP.05에 적은 실제 사고는 **한 글자**였다.
const ORPHAN_CHARS = 1.6;

/**
 * @param page        Playwright Page (setContent 이후)
 * @param selectors   검사할 루트 요소들의 CSS 선택자 배열 (슬라이드 하나 = 하나)
 * @param opts.safeBottom  하단 안전 여백(px). 콘텐츠가 이 안으로 들어오면 경고. 0이면 안 봄
 * @param opts.skip        장식용이라 밖으로 나가도 되는 요소의 클래스 목록
 * @returns [{ selector, findings: [{ level:'error'|'warn', kind, detail }] }]
 */
export async function inspect(page, selectors, opts = {}) {
  const { safeBottom = 0, skip = ['glow', 'hglow'] } = opts;
  return page.evaluate(
    ({ sels, TOL, ORPHAN_CHARS, safeBottom, skip }) => {
      const name = (el) => {
        const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
        return c ? '.' + c : el.tagName.toLowerCase();
      };
      const textNodes = (root) => {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const out = [];
        for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.trim()) out.push(n);
        return out;
      };

      return sels.map((sel) => {
        const root = document.querySelector(sel);
        const findings = [];
        if (!root) return { selector: sel, findings: [{ level: 'error', kind: '요소 없음', detail: sel }] };
        const rr = root.getBoundingClientRect();

        // ── ① 넘침 ────────────────────────────────────────────────
        // 방향별로 "가장 많이 넘친 요소 하나"만 보고한다. 세로로 넘치면 그 아래
        // 요소가 전부 같이 넘쳐서(실측 14개) 줄줄이 찍히면 읽을 수가 없다.
        const worst = {};   // kind -> { px, el, count }
        const bump = (kind, px, el) => {
          const w = worst[kind];
          if (!w || px > w.px) worst[kind] = { px, el: name(el), count: (w?.count ?? 0) + 1 };
          else w.count++;
        };
        let deepest = rr.top;   // 여백 침범 판정용 — 콘텐츠의 실제 최하단

        // ⚠️⚠️ 여기가 이 검사의 핵심이자 오탐이 나던 자리다.
        //   `.inner`는 아래 패딩 72px을 달고 슬라이드 바닥까지 내려온다. 경계 사각형만
        //   보면 콘텐츠가 조금만 길어져도 "34px 잘림"이 뜨는데, **실제로 잘린 건
        //   패딩뿐이고 글자·버튼·막대는 멀쩡했다.** 실물을 열어보고 나서야 알았다.
        //   → 배경이나 테두리가 있어서 **박스 자체가 눈에 보이는 요소**는 박스 그대로,
        //     투명한 레이아웃 컨테이너는 **패딩·테두리를 뺀 콘텐츠 박스**로 잰다.
        const visibleBox = (el, r) => {
          const cs = getComputedStyle(el);
          const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs['border' + s + 'Width']) || 0);
          const bg = cs.backgroundColor || '';
          const paints = bw.some((w) => w > 0) || (bg && bg !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(bg));
          if (paints) return r;
          const p = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs['padding' + s]) || 0);
          return {
            top: r.top + p[0] + bw[0], right: r.right - p[1] - bw[1],
            bottom: r.bottom - p[2] - bw[2], left: r.left + p[3] + bw[3],
          };
        };

        for (const el of root.querySelectorAll('*')) {
          if (skip.some((c) => el.classList.contains(c))) continue;
          const raw = el.getBoundingClientRect();
          if (raw.width === 0 && raw.height === 0) continue;      // 숨김(display:none 등)
          const r = visibleBox(el, raw);

          if (r.bottom > rr.bottom + TOL) bump('아래로 잘림', r.bottom - rr.bottom, el);
          if (r.top < rr.top - TOL) bump('위로 잘림', rr.top - r.top, el);
          if (r.right > rr.right + TOL) bump('오른쪽 잘림', r.right - rr.right, el);
          if (r.left < rr.left - TOL) bump('왼쪽 잘림', rr.left - r.left, el);

          // ⚠️ 요소 밖으로는 안 나가는데 요소 **안에서** 잘리는 경우가 따로 있다.
          //    긴 URL·영문 토큰이 대표적이고, 이건 경계 사각형으로는 안 보인다.
          if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
            bump('가로 넘침(요소 내부)', el.scrollWidth - el.clientWidth, el);
          }
          if (r.bottom > deepest && r.bottom <= rr.bottom + TOL) deepest = r.bottom;
        }
        for (const [kind, w] of Object.entries(worst)) {
          findings.push({
            level: 'error',
            kind,
            detail: `${w.el} 가 ${Math.round(w.px)}px${w.count > 1 ? ` (요소 ${w.count}개)` : ''}`,
          });
        }

        // 여백 침범 — 잘리진 않았지만 하단 패딩까지 밀고 들어온 상태
        if (safeBottom > 0 && !worst['아래로 잘림']) {
          const room = rr.bottom - deepest;
          if (room < safeBottom - TOL) {
            findings.push({
              level: 'warn',
              kind: '하단 여백 침범',
              detail: `남은 여백 ${Math.round(room)}px (기준 ${safeBottom}px)`,
            });
          }
        }

        // ── ② 고아 줄 ─────────────────────────────────────────────
        // Range로 줄별 사각형을 얻어 마지막 줄 폭을 본다. 폭이 글자 2개 남짓보다
        // 좁으면 한 글자가 혼자 떨어진 것이다. **임계값 휴리스틱이라 경고만.**
        for (const el of root.querySelectorAll('h1, h2, .sub, .body, .note, .cn')) {
          const fs = parseFloat(getComputedStyle(el).fontSize) || 40;
          for (const node of textNodes(el)) {
            const rng = document.createRange();
            rng.selectNodeContents(node);
            const rects = [...rng.getClientRects()].filter((r) => r.width > 0);
            if (rects.length < 2) continue;                       // 한 줄짜리는 고아가 없다
            const last = rects[rects.length - 1];
            if (last.width < fs * ORPHAN_CHARS) {
              findings.push({
                level: 'warn',
                kind: '고아 줄',
                detail: `${name(el)} 마지막 줄 폭 ${Math.round(last.width)}px (글자 ${fs}px) — "…${node.nodeValue.trim().slice(-12)}"`,
              });
            }
          }
        }
        return { selector: sel, findings };
      });
    },
    { sels: selectors, TOL, ORPHAN_CHARS, safeBottom, skip }
  );
}

/**
 * 검사 결과를 사람이 읽는 형태로 출력하고, 치명 오류 개수를 돌려준다.
 * @param labelOf  선택자 → 화면에 찍을 이름 (예: 슬라이드 번호)
 */
export function report(results, labelOf = (r, i) => `${i + 1}번`) {
  let errors = 0, warns = 0;
  results.forEach((r, i) => {
    if (!r.findings.length) return;
    console.log(`\n  ${labelOf(r, i)}`);
    for (const f of r.findings) {
      const mark = f.level === 'error' ? '❌' : '⚠️';
      if (f.level === 'error') errors++; else warns++;
      console.log(`    ${mark} ${f.kind} — ${f.detail}`);
    }
  });
  if (!errors && !warns) console.log('자기검사: 이상 없음');
  else {
    console.log(`\n자기검사: ❌ ${errors}건 · ⚠️ ${warns}건`);
    if (errors) {
      console.log('   ↳ ❌는 잘려서 나간다. 이미지는 그대로 저장했으니 열어보고 고칠 것.');
      console.log('   ↳ ⚠️는 눈으로 보고 판단. 색이 뜻과 맞는지는 이 검사가 못 본다.');
    }
  }
  return errors;
}
