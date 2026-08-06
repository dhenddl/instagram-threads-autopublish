// alt.mjs — 카드뉴스 슬라이드 내용으로 인스타 대체텍스트(alt_text)를 자동 생성
//
// 목적: 접근성 + SEO. 각 슬라이드의 실제 문구를 자연스러운 한 줄로 요약하고,
//       시리즈명(표지 배지)을 앞에 붙여 검색 키워드 맥락을 준다.
// 인스타 alt_text는 이미지·캐러셀 아이템에서 지원(2025-03~), 릴스·스토리는 미지원.

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

// 슬라이드 타입별로 핵심 문구를 뽑는다
function slideCore(slide) {
  // 슬라이드가 alt를 직접 주면 그걸 쓴다 — 차트·표 카드(curve/table)는 kicker+heading만으론
  // "무슨 데이터인지"가 전혀 전달되지 않아서, 그림을 못 보는 사람에게는 alt가 유일한 내용이다.
  if (slide.alt) return clean(slide.alt);
  if (slide.type === 'cover') {
    const t = clean(slide.title);
    const sub = clean(slide.sub);
    return sub ? `${t} — ${sub}` : t;
  }
  if (slide.type === 'cta') {
    const h = clean(slide.heading);
    const b = clean(slide.body);
    return b ? `${h}. ${b}` : h;
  }
  // content / goal 등: 코너명(kicker) + 소제목(heading)
  const kicker = clean(slide.kicker);
  const heading = clean(slide.heading);
  return kicker && heading ? `${kicker} — ${heading}` : (heading || kicker);
}

// 시리즈 라벨: 표지 배지 우선(가장 키워드가 풍부), 없으면 meta.series
function seriesLabel(card) {
  const cover = (card.slides ?? []).find((s) => s.type === 'cover');
  return clean(cover?.badge) || clean(card.meta?.series) || '카드뉴스';
}

// cardnews json(meta+slides) → alt 문자열 배열 (슬라이드당 1개, 슬라이드 순서)
export function buildAlts(card) {
  const slides = card.slides ?? [];
  const total = slides.length;
  const label = seriesLabel(card);
  return slides.map((s, i) => {
    const core = slideCore(s).slice(0, 400);
    // 인스타 alt_text 상한(약 1000자) 안쪽으로 여유 있게 자른다
    return `${label} · 카드뉴스 ${i + 1}/${total} — ${core}`.slice(0, 900);
  });
}
