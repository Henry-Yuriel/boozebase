// 배포 전 설정은 config.js 한 곳에서 변경합니다.
const appConfig = window.LIQUOR_TRACKER_CONFIG || {};
const emailConfig = appConfig.email || {};
const affiliateConfig = appConfig.affiliate || {};

const PAGE_SIZE = 12;
const MYLIST_STORAGE_KEY = "tpi_mylist_v1";
const LOCAL_REVIEWS_STORAGE_KEY = "bb_user_reviews_v1";

const categoryLabels = {
  whisky: "위스키",
  red_wine: "레드 와인",
  white_wine: "화이트·샴페인",
  sake: "사케",
  other: "전통주·명주",
};

const SEED_REVIEWS = [
  {
    submitted_at: "2026-10-24",
    product_id: "yoichi-single-malt",
    product_name: "닛카 요이치 싱글몰트",
    category: "whisky",
    nickname: "피트향수집가",
    rating: 5,
    pairing_snack: "훈제 치즈",
    comment: "요이치 특유의 묵직한 피트·바다 내음에 스모크 치즈 한 조각 올리니 풍미가 두 배로 살아납니다.",
  },
  {
    submitted_at: "2026-10-25",
    product_id: "andre-goichot-bourgogne-pinot-noir",
    product_name: "앙드레 고이쇼 부르고뉴 피노 누아",
    category: "red_wine",
    nickname: "부르고뉴산책",
    rating: 5,
    pairing_snack: "오리 가슴살",
    comment: "화사한 붉은 베리 산미가 에어프라이어에 구운 오리 가슴살 기름기를 깔끔하게 잡아줘요.",
  },
  {
    submitted_at: "2026-10-26",
    product_id: "dassai-23",
    product_name: "닷사이 23 준마이다이긴죠",
    category: "sake",
    nickname: "니혼슈노트",
    rating: 5,
    pairing_snack: "광어회",
    comment: "멜론처럼 화려한 긴죠향이라 양념 강한 요리보다 숙성 광어회나 흰살생선 사시미가 최고였습니다.",
  },
  {
    submitted_at: "2026-10-27",
    product_id: "macallan-12-sherry-oak",
    product_name: "맥캘란 12년 셰리 오크",
    category: "whisky",
    nickname: "셰리캐스크",
    rating: 5,
    pairing_snack: "다크 초콜릿",
    comment: "건포도와 오크 스파이스 피니시에는 카카오 85% 이상 다크 초콜릿 한 조각이 정석입니다.",
  },
  {
    submitted_at: "2026-10-28",
    product_id: "hakkaisan-junmai-daiginjo",
    product_name: "핫카이산 준마이다이긴죠",
    category: "sake",
    nickname: "키레맛",
    rating: 4,
    pairing_snack: "흰살생선 소금구이",
    comment: "깔끔하게 떨어지는 끝맛 덕분에 짭조름한 도미나 반건조 생선구이와 반주로 마시기 좋았어요.",
  },
  {
    submitted_at: "2026-10-28",
    product_id: "montes-alpha-carmenere",
    product_name: "몬테스 알파 까르미네르",
    category: "red_wine",
    nickname: "주말홈바",
    rating: 5,
    pairing_snack: "양갈비 스테이크",
    comment: "블랙페퍼와 자두 풍미가 진해서 허브 솔트 뿌린 양갈비 프렌치랙과 집에서 레스토랑 분위기 냈습니다.",
  },
];

const state = {
  products: [],
  category: "all",
  preset: "all",
  spotlightBottleId: "",
  search: "",
  sort: "featured",
  visibleLimit: PAGE_SIZE,
  myList: loadMyList(),
  reviews: [...loadLocalReviews(), ...SEED_REVIEWS],
  reviewCategory: "all",
  activeReviewProductId: "",
};

const CURATION_PRESETS = [
  { key: "all", label: "✨ 전체 큐레이션" },
  { key: "under_50k", label: "💸 5만 원 이하 가성비" },
  { key: "gift_100k", label: "🎁 10만 원대 선물용" },
  { key: "luxury_200k", label: "👑 20만 원+ 하이엔드" },
  { key: "highball", label: "🍋 하이볼 1티어" },
  { key: "meat_pairing", label: "🥩 스테이크·고기 단짝" },
  { key: "seafood_pairing", label: "🍣 회·해산물 반주" },
];

const $ = (selector, root = document) => root.querySelector(selector);
const priceFormatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

function formatPrice(amount) {
  return `₩${priceFormatter.format(Number(amount) || 0)}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

const IMAGE_CACHE_VERSION = "20261102-500bottles";

function safeProductImage(value, productId = "") {
  const path = String(value ?? "").trim().replace(/\?.*$/, "");
  if (/^\.?\/?assets\/images\/[a-z0-9-_]+\.(?:webp|png|jpe?g)$/i.test(path)) {
    const normalized = path.startsWith("./") || path.startsWith("/") ? path : `./${path}`;
    return `${normalized}?v=${IMAGE_CACHE_VERSION}`;
  }
  if (/^https?:\/\//i.test(path)) {
    const remote = safeHttpUrl(path);
    if (remote !== "#") return remote;
  }
  const slug = String(productId ?? "").trim();
  if (/^[a-z0-9-]+$/i.test(slug)) {
    return `./assets/images/${slug}.webp?v=${IMAGE_CACHE_VERSION}`;
  }
  return "";
}

function loadMyList() {
  try {
    const raw = window.localStorage.getItem(MYLIST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.trim()) : [];
  } catch {
    return [];
  }
}

function saveMyList() {
  try {
    window.localStorage.setItem(MYLIST_STORAGE_KEY, JSON.stringify(state.myList));
  } catch {
    // localStorage 차단 환경 무시
  }
}

function loadLocalReviews() {
  try {
    const raw = window.localStorage.getItem(LOCAL_REVIEWS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalReview(review) {
  try {
    const existing = loadLocalReviews();
    existing.unshift(review);
    window.localStorage.setItem(LOCAL_REVIEWS_STORAGE_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch {
    // localStorage 차단 환경 무시
  }
}

// 3단계 계층형 쿠팡 제휴 링크 매핑 엔진
function resolveAffiliateLink(productId, pairingText, explicitUrl = "") {
  const direct = String(affiliateConfig.links?.[productId] || explicitUrl || "").trim();
  if (direct && safeHttpUrl(direct) !== "#") {
    return { href: safeHttpUrl(direct), isPartner: true };
  }

  const categoryPool = affiliateConfig.pairingCategoryLinks || {};
  const normalizedText = String(pairingText || "").toLocaleLowerCase("ko-KR");
  const sortedKeys = Object.keys(categoryPool).sort((a, b) => b.length - a.length);
  for (const keyword of sortedKeys) {
    if (keyword && normalizedText.includes(keyword.toLocaleLowerCase("ko-KR"))) {
      const candidate = safeHttpUrl(categoryPool[keyword]);
      if (candidate !== "#") {
        return { href: candidate, isPartner: true };
      }
    }
  }

  const fallbackBase = String(affiliateConfig.fallbackSearchBaseUrl || "https://www.coupang.com/np/search?q=");
  const fallbackHref = safeHttpUrl(`${fallbackBase}${encodeURIComponent(pairingText || "위스키 페어링 안주")}`);
  return { href: fallbackHref, isPartner: false };
}

// 주종·보틀별 맞춤 전용 글라스 & 홈바 장비 매핑 엔진
function resolveBarwareForProduct(product) {
  const id = String(product.id || "").toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const note = String(product.best?.price_note || "").toLowerCase();
  const cat = String(product.category || "");
  const barwarePool = affiliateConfig.barwareLinks || {};

  let key = "nosing_glass";
  let label = "🥃 글렌케런 노징 글라스 & 투명 아이스볼 세트";
  let fallbackQuery = "글렌케런 위스키 노징 글라스 세트";

  if (cat === "whisky") {
    if (/(jim-beam|kakubin|makers-mark|jameson|chita|monkey-shoulder|bushmills|bulleit)/.test(id) || note.includes("하이볼") || name.includes("하이볼")) {
      key = "highball_kit";
      label = "🍋 전용 하이볼 조끼잔 & 토닉워터 키트";
      fallbackQuery = "산토리 하이볼 전용 조끼잔 세트";
    } else if (/(wild-turkey|buffalo-trace|woodford|knob-creek|elijah-craig|jack-daniels|blue-label|royal-salute)/.test(id) || name.includes("버번")) {
      key = "ontherocks_ice";
      label = "🧊 크리스탈 온더락 잔 & 투명 빅볼 아이스 메이커";
      fallbackQuery = "투명 아이스볼 메이커 크리스탈 온더락 잔";
    } else {
      key = "nosing_glass";
      label = "🥃 글렌케런 크리스탈 노징 글라스 세트";
      fallbackQuery = "글렌케런 위스키 노징 글라스 세트";
    }
  } else if (cat === "red_wine") {
    if (/(pinot-noir|bourgogne|barolo|brunello|chablis)/.test(id) || name.includes("피노 누아") || name.includes("부르고뉴")) {
      key = "burgundy_glass";
      label = "🍷 부르고뉴 크리스탈 와인잔 & 전동 오프너";
      fallbackQuery = "부르고뉴 크리스탈 와인잔 전동 오프너";
    } else {
      key = "bordeaux_glass";
      label = "🍷 보르도 크리스탈 와인잔 & 와인 디캔터";
      fallbackQuery = "쇼트즈위젤 리델 보르도 와인잔 디캔터";
    }
  } else if (cat === "white_wine") {
    if (/(moet|veuve|dom-perignon|ruinart|krug|taittinger|bollinger|piper|laurent-perrier|cava|moscato)/.test(id) || name.includes("샴페인") || name.includes("모스카토") || name.includes("까바")) {
      key = "champagne_flute";
      label = "🥂 크리스탈 샴페인 플루트 잔 & 아이스 버킷";
      fallbackQuery = "크리스탈 샴페인 플루트 잔 아이스 버킷";
    } else {
      key = "white_wine_glass";
      label = "🥂 화이트 와인 전용 잔 & 칠링백 세트";
      fallbackQuery = "화이트 와인 전용잔 와인 칠링백 세트";
    }
  } else if (cat === "sake") {
    key = "sake_tokkuri";
    label = "🍶 냉사케 크리스탈 도쿠리 주병 & 사케잔 세트";
    fallbackQuery = "냉사케 도쿠리 주병 사케잔 세트";
  } else {
    if (/(yeontae|shuijingfang|kaoliang|moutai)/.test(id) || name.includes("고량주") || name.includes("백주") || name.includes("마오타이") || name.includes("수정방")) {
      key = "baijiu_glass";
      label = "🍶 백주·고량주 전용 크리스탈 미니어처 잔 세트";
      fallbackQuery = "고량주 백주 전용 크리스탈 잔 세트";
    } else if (/(hennessy|remy-martin|camus)/.test(id) || name.includes("꼬냑")) {
      key = "cognac_snifter";
      label = "🥃 꼬냑 스니프터 크리스탈 테이스팅 잔";
      fallbackQuery = "꼬냑 스니프터 크리스탈 테이스팅 잔";
    } else if (/(hwayo|ilpum|won-soju)/.test(id) || name.includes("화요") || name.includes("일품진로") || name.includes("원소주")) {
      key = "soju_ontherocks";
      label = "🧊 증류주 온더락 크리스탈 잔 & 원형 얼음틀";
      fallbackQuery = "온더락 크리스탈 잔 원형 얼음틀 세트";
    } else {
      key = "cocktail_shaker";
      label = "🍸 홈바 칵테일 쉐이커 & 하이볼 글라스 키트";
      fallbackQuery = "홈바 칵테일 쉐이커 하이볼 잔 세트";
    }
  }

  const partnerHref = safeHttpUrl(String(barwarePool[key] || "").trim());
  if (partnerHref !== "#") {
    const isOfficialPartner = /^https?:\/\/(link\.coupang\.com|coupa\.ng)\//i.test(partnerHref);
    return { label, href: partnerHref, isPartner: isOfficialPartner };
  }
  const fallbackBase = String(affiliateConfig.fallbackSearchBaseUrl || "https://www.coupang.com/np/search?q=");
  return {
    label,
    href: safeHttpUrl(`${fallbackBase}${encodeURIComponent(fallbackQuery)}`),
    isPartner: false,
  };
}

// 1잔당 홈바 가성비 및 바(Bar)·다이닝 대비 절약 금액 계산기
function calculatePourEconomics(product) {
  const price = Number(product.best?.price) || 0;
  const vol = Number(product.volume) || 750;
  const cat = String(product.category || "");
  if (price <= 0) return null;

  let pourMl = 30;
  let venueLabel = "바(Bar)";
  let markupMultiplier = 3.1;

  if (cat === "red_wine" || cat === "white_wine") {
    pourMl = 125;
    venueLabel = "레스토랑";
    markupMultiplier = 2.6;
  } else if (cat === "sake") {
    pourMl = 90;
    venueLabel = "이자카야";
    markupMultiplier = 2.8;
  } else if (cat === "other" && price <= 55000) {
    pourMl = 45;
    venueLabel = "다이닝";
    markupMultiplier = 2.5;
  }

  const totalPours = Math.max(1, Math.round(vol / pourMl));
  const rawPerPour = price / totalPours;
  const perPourPrice = Math.max(500, Math.round(rawPerPour / 100) * 100);
  const rawSavings = Math.max(15000, Math.round((price * (markupMultiplier - 1)) / 1000) * 1000);

  let savingsFormatted = "";
  if (rawSavings >= 100000) {
    savingsFormatted = `약 ₩${Math.round(rawSavings / 10000)}만 원 절약`;
  } else {
    const man = (rawSavings / 10000).toFixed(1).replace(/\.0$/, "");
    savingsFormatted = `약 ₩${man}만 원 절약`;
  }

  return {
    pourMl,
    totalPours,
    perPourPrice,
    venueLabel,
    savingsFormatted,
  };
}

const HOMEBAR_ATELIER_ITEMS = [
  {
    key: "nosing_glass",
    eyebrow: "SINGLE MALT & COGNAC",
    title: "글렌케런 & 크리스탈 노징 글라스 세트",
    priceRange: "₩28,000 ~ ₩65,000",
    desc: "튤립형 보울이 위스키의 아로마를 2배 이상 응집시켜, 바에서 마시던 깊은 테이스팅 노트를 집에서도 온전히 경험하게 해줍니다.",
    matchBottles: "발베니 · 맥캘란 · 글렌피딕 · 야마자키 · 헤네시",
    ctaLabel: "글렌케런 노징 글라스 살펴보기",
  },
  {
    key: "ontherocks_ice",
    eyebrow: "BOURBON & ON THE ROCKS",
    title: "투명 빅볼 아이스 메이커 & 헤비 온더락 잔",
    priceRange: "₩19,000 ~ ₩48,000",
    desc: "기포 없이 천천히 녹는 6cm 투명 원형 아이스볼을 만들어 마지막 한 모금까지 위스키와 증류주의 도수·풍미를 일정하게 지킵니다.",
    matchBottles: "와일드터키 · 버팔로 트레이스 · 조니워커 블루 · 화요 41",
    ctaLabel: "투명 빅볼 메이커 & 온더락 잔 보기",
  },
  {
    key: "highball_kit",
    eyebrow: "HIGHBALL & CRAFT SPIRIT",
    title: "하이볼 전용 조끼잔 & 토닉워터 1박스 스타터 키트",
    priceRange: "₩24,000 ~ ₩42,000",
    desc: "이자카야 생하이볼의 탄산감과 그립감을 집에서 그대로 재현하는 전용 조끼 글라스와 대용량 토닉워터·진저에일 홈바 번들입니다.",
    matchBottles: "산토리 가쿠빈 · 짐빔 화이트 · 메이커스 마크 · 로쿠 진",
    ctaLabel: "하이볼 조끼잔 & 토닉워터 키트 보기",
  },
  {
    key: "wine_glass_opener",
    eyebrow: "RED WINE & DECANTING",
    title: "리델·쇼트즈위젤 보르도 와인잔 & 전동 오프너",
    priceRange: "₩39,000 ~ ₩110,000",
    desc: "와인의 브리딩(Breathing)과 탄닌 밸런스를 즉시 열어주는 대형 크리스탈 보울과 코르크 파손 없는 원터치 전동 오프너·에어레이터입니다.",
    matchBottles: "오퍼스 원 · 케이머스 · 1865 · 몬테스 알파 · 티냐넬로",
    ctaLabel: "크리스탈 와인잔 & 전동 오프너 보기",
  },
  {
    key: "sake_tokkuri",
    eyebrow: "JUNMAI DAIGINJO & BAIJIU",
    title: "얼음 포켓 냉사케 도쿠리 주병 & 오초코 잔 세트",
    priceRange: "₩25,000 ~ ₩58,000",
    desc: "사케가 물에 희석되지 않고 차가운 온도를 유지하는 얼음 포켓 유리 주병과 식탁의 품격을 높이는 수제 사케·백주 전용잔 세트입니다.",
    matchBottles: "닷사이 23·39 · 쿠보타 만쥬 · 핫카이산 · 연태고량주 · 수정방",
    ctaLabel: "냉사케 주병 & 전용잔 세트 보기",
  },
  {
    key: "homebar_cabinet",
    eyebrow: "COLLECTOR STORAGE & CELLAR",
    title: "우드 위스키 보틀 진열장 & 저소음 미니 와인셀러",
    priceRange: "₩69,000 ~ ₩289,000",
    desc: "아끼는 위스키 컬렉션을 바처럼 연출하는 원목 조명 진열장과 와인·사케의 최적 보관 온도(12~15°C)를 일정하게 유지하는 미니 와인셀러입니다.",
    matchBottles: "위스키 컬렉션 진열 · 프리미엄 와인·사케 장기 보관",
    ctaLabel: "홈바 진열장 & 미니 와인셀러 보기",
  },
];

function renderBarwareShowcase() {
  const container = $("#barware-grid");
  if (!container) return;
  const barwarePool = affiliateConfig.barwareLinks || {};
  const fallbackBase = String(affiliateConfig.fallbackSearchBaseUrl || "https://www.coupang.com/np/search?q=");

  container.innerHTML = HOMEBAR_ATELIER_ITEMS.map((item) => {
    const partnerUrl = safeHttpUrl(String(barwarePool[item.key] || "").trim());
    const isPartner = partnerUrl !== "#" && /^https?:\/\/(link\.coupang\.com|coupa\.ng)\//i.test(partnerUrl);
    const href = partnerUrl !== "#" ? partnerUrl : safeHttpUrl(`${fallbackBase}${encodeURIComponent(item.title)}`);
    return `<article class="barware-card">
      <div class="barware-card-top">
        <div class="barware-kicker">
          <span>${escapeHTML(item.eyebrow)}</span>
          <strong class="barware-price-range">${escapeHTML(item.priceRange)}</strong>
        </div>
        <h3>${escapeHTML(item.title)}</h3>
        <p class="barware-desc">${escapeHTML(item.desc)}</p>
      </div>
      <div class="barware-card-bottom">
        <div class="barware-match">
          <small>MATCHING BOTTLES</small>
          <span>${escapeHTML(item.matchBottles)}</span>
        </div>
        <a class="barware-cta-button" href="${escapeHTML(href)}" target="_blank" rel="${isPartner ? "sponsored " : ""}nofollow noopener noreferrer">
          <span>${escapeHTML(item.ctaLabel)}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>`;
  }).join("");
}

function makeProducts(rows) {
  const groups = new Map();
  for (const row of rows) {
    const volume = row.attributes?.volume_ml ?? "";
    const key = `${row.name}|${row.category}|${volume}`;
    if (!groups.has(key)) groups.set(key, { name: row.name, category: row.category, volume, records: [] });
    groups.get(key).records.push(row);
  }
  return [...groups.values()].map((product) => {
    const byPrice = (a, b) => Number(a.price) - Number(b.price);
    const offers = product.records.slice().sort(byPrice);
    const available = offers.filter((offer) => offer.stock_status === "in_stock");
    const best = (available.length ? available : offers)[0];
    const outOfStockCount = offers.filter((offer) => offer.stock_status === "sold_out").length;
    const productId = product.records[0]?.product_id || product.name;
    const pairingItem = best?.pairing_item || "추천 페어링 아이템";
    const resolved = resolveAffiliateLink(productId, pairingItem, best?.affiliate_link);
    return {
      ...product,
      image: product.records.find((record) => record.image)?.image || "",
      offers,
      best,
      availableCount: available.length,
      outOfStockCount,
      minPrice: Number(offers[0]?.price) || 0,
      maxPrice: Number(offers.at(-1)?.price) || 0,
      pairingItem,
      affiliateLink: resolved.href,
      hasPartnerLink: resolved.isPartner,
      id: productId,
    };
  });
}

function categoryName(category) {
  return categoryLabels[category] || "기타";
}

function stockLabel(status) {
  if (status === "in_stock") return "출처 기준 재고";
  if (status === "sold_out") return "출처 기준 품절";
  return "재고 미확인";
}

function matchesPreset(product, presetKey) {
  if (!presetKey || presetKey === "all") return true;
  const price = Number(product.best?.price) || 0;
  const id = String(product.id || "").toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const note = String(product.best?.price_note || "").toLowerCase();
  const pairing = String(product.pairingItem || "").toLowerCase();
  const cat = String(product.category || "");

  switch (presetKey) {
    case "under_50k":
      return price > 0 && price <= 50000;
    case "gift_100k":
      return price >= 80000 && price <= 199000;
    case "luxury_200k":
      return price >= 200000;
    case "highball":
      return (
        note.includes("하이볼") ||
        name.includes("하이볼") ||
        /(jim-beam|kakubin|makers-mark|jameson|chita|monkey-shoulder|bushmills|bulleit|toki|black-label|jack-daniels|evan-williams|ballantine|famous-grouse|dewars|hwayo|ilpum|tanqueray|hendricks|bombay|roku)/.test(id) ||
        (cat === "whisky" && price <= 65000)
      );
    case "meat_pairing":
      return /(스테이크|등심|안심|양갈비|갈비|삼겹살|바비큐|립|하몽|육포|소고기|오리|토마호크|부채살)/.test(pairing) || cat === "red_wine";
    case "seafood_pairing":
      return /(회|사시미|연어|광어|참치|방어|새우|감바스|굴|전복|가리비|관자|문어|해산물|생선|초밥|스시)/.test(pairing) || cat === "sake" || cat === "white_wine";
    default:
      return true;
  }
}

function renderPresets() {
  const container = $("#preset-filters");
  if (!container) return;
  container.innerHTML = CURATION_PRESETS.map((preset) => {
    const count = state.products.filter((p) => {
      const catOk = state.category === "all" || p.category === state.category;
      return catOk && matchesPreset(p, preset.key);
    }).length;
    const isActive = state.preset === preset.key;
    return `<button type="button" class="preset-chip ${isActive ? "is-active" : ""}" data-preset="${escapeHTML(preset.key)}" aria-pressed="${isActive}">
      ${escapeHTML(preset.label)} <span>${count}</span>
    </button>`;
  }).join("");
}

function renderFilters() {
  const counts = new Map();
  for (const product of state.products) counts.set(product.category, (counts.get(product.category) || 0) + 1);
  const buttons = [{ key: "all", label: "전체", count: state.products.length }, ...[...counts.entries()].map(([key, count]) => ({ key, label: categoryName(key), count }))];
  $("#category-filters").innerHTML = buttons.map((item) => `
    <button type="button" class="filter-chip ${state.category === item.key ? "is-active" : ""}"
      data-category="${escapeHTML(item.key)}" aria-pressed="${state.category === item.key}">
      ${escapeHTML(item.label)} <span>${String(item.count).padStart(2, "0")}</span>
    </button>`).join("");
  renderPresets();
}

function bottleArt(product, index, isSaved) {
  const imagePath = safeProductImage(product.image, product.id);
  const badgeMap = {
    whisky: "SINGLE MALT & CASK",
    red_wine: "RED RESERVE",
    white_wine: "BLANC & CHAMPAGNE",
    sake: "JUNMAI DAIGINJO",
    other: "CRAFT SPIRIT",
  };
  const paletteMap = {
    whisky: { top: "#d49b56", mid: "#7b4e27", cap: "#b68147" },
    red_wine: { top: "#b53f42", mid: "#4f161b", cap: "#8f2d33" },
    white_wine: { top: "#d8cb7c", mid: "#6c6f39", cap: "#b5a659" },
    sake: { top: "#8fb7cb", mid: "#2f4d5e", cap: "#6c92a6" },
    other: { top: "#c2b89f", mid: "#565143", cap: "#9c9178" },
  };
  const initials = badgeMap[product.category] || categoryName(product.category).toUpperCase();
  const colors = paletteMap[product.category] || paletteMap.whisky;
  const volLabel = product.volume ? `${product.volume} ML` : "CURATED";
  return `<div class="product-art art-${escapeHTML(product.category)}${imagePath ? " has-product-photo" : ""}">
    <button type="button" class="art-wishlist-chip ${isSaved ? "is-saved" : ""}" data-wishlist-toggle="${escapeHTML(product.id)}" aria-pressed="${isSaved}" aria-label="${escapeHTML(product.name)} 관심 리스트 ${isSaved ? "해제" : "담기"}">
      ${isSaved ? "♥" : "♡"}
    </button>
    ${imagePath ? `<img class="product-photo" src="${escapeHTML(imagePath)}" alt="${escapeHTML(product.name)} 실제 보틀 사진" loading="lazy" decoding="async" />` : ""}
    <div class="product-art-fallback"${imagePath ? " hidden" : ""} aria-hidden="true">
      <span class="art-topline">Booze Base <i>·</i> ${escapeHTML(volLabel)}</span>
      <span class="bottle-shadow"></span>
      <svg class="product-bottle" viewBox="0 0 126 188" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M48 9h30v26l12 17v103c0 13-10 23-23 23H59c-13 0-23-10-23-23V52l12-17V9Z" fill="url(#product-liquid-${index})" stroke="#e6d8bd" stroke-opacity=".7" stroke-width="1.4"/>
        <path d="M48 9h30v13H48z" fill="${colors.cap}" stroke="#e6d8bd" stroke-opacity=".65" stroke-width="1.2"/>
        <path d="M38 86h50v48H38z" fill="#141511" stroke="#c8ac7b" stroke-opacity=".65"/>
        <circle cx="63" cy="101" r="5" stroke="#d3a86d"/><path d="M48 115h30M52 124h22" stroke="#d3a86d" stroke-linecap="round"/>
        <path d="M37 61c13 5 38 5 52 0" stroke="#fff0d5" stroke-opacity=".42"/>
        <defs><linearGradient id="product-liquid-${index}" x1="32" y1="10" x2="93" y2="178" gradientUnits="userSpaceOnUse"><stop stop-color="${colors.top}" stop-opacity=".86"/><stop offset=".48" stop-color="${colors.mid}" stop-opacity=".88"/><stop offset="1" stop-color="#1d2019"/></linearGradient></defs>
      </svg>
      <span class="art-vintage">${escapeHTML(initials)}<b>NO. ${String(index + 1).padStart(2, "0")}</b></span>
      <span class="art-index">ARCHIVE EDITION · VERIFIED SOURCE</span>
    </div>
  </div>`;
}

function getProductReviewCount(productId) {
  return state.reviews.filter((r) => r.product_id === productId).length;
}

function renderProduct(product, index) {
  const isSaved = state.myList.includes(product.id);
  const reviewCount = getProductReviewCount(product.id);
  const comparison = product.offers.length > 1
    ? `<div class="offer-list" aria-label="확인된 판매처 가격">${product.offers.map((offer) => `
        <div class="offer-row"><span>${escapeHTML(offer.attributes?.listing_label || "확인 판매처")}</span><span>${formatPrice(offer.price)}</span><span class="offer-stock ${offer.stock_status === "in_stock" ? "is-in" : offer.stock_status === "sold_out" ? "is-out" : "is-unknown"}">${stockLabel(offer.stock_status)}</span></div>`).join("")}</div>`
    : `<div class="single-offer"><span>${escapeHTML(product.best.attributes?.listing_label || "확인 판매처")}</span><span class="offer-stock ${product.best.stock_status === "in_stock" ? "is-in" : product.best.stock_status === "sold_out" ? "is-out" : "is-unknown"}">${stockLabel(product.best.stock_status)}</span></div>`;
  const stockText = product.availableCount > 0 ? "출처 기준 재고" : product.outOfStockCount === product.offers.length ? "출처 기준 품절" : "재고 미확인";
  const volume = product.volume ? `${escapeHTML(product.volume)} ml` : "용량 정보 없음";
  const grape = product.best.attributes?.grape_variety ? ` · ${escapeHTML(product.best.attributes.grape_variety)}` : "";
  const econ = calculatePourEconomics(product);
  const pourMetricsHtml = econ
    ? `<div class="pour-metrics" aria-label="홈바 가성비 및 절약 금액">
        <span class="pour-metric-chip">1잔(${econ.pourMl}ml·총 ${econ.totalPours}잔) 약 <strong>${formatPrice(econ.perPourPrice)}</strong></span>
        <span class="pour-saving-chip">${escapeHTML(econ.venueLabel)} 대비 <strong>${escapeHTML(econ.savingsFormatted)}</strong></span>
      </div>`
    : "";
  const hasPartnerLink = Boolean(product.hasPartnerLink && product.affiliateLink !== "#");
  const affiliateHref = product.affiliateLink;
  const barware = resolveBarwareForProduct(product);
  const barwareButtonHtml = barware && barware.href !== "#"
    ? `<a class="barware-button" href="${escapeHTML(barware.href)}" target="_blank" rel="${barware.isPartner ? "sponsored " : ""}nofollow noopener noreferrer"><span>${escapeHTML(barware.label)}</span><span aria-hidden="true">↗</span></a>`
    : "";
  const affiliate = affiliateHref !== "#"
    ? `<div class="affiliate-stack">
        <a class="pairing-button" href="${escapeHTML(affiliateHref)}" target="_blank" rel="${hasPartnerLink ? "sponsored " : ""}nofollow noopener noreferrer"><span>${hasPartnerLink ? `🍴 최고의 페어링 안주 구매하기 (${escapeHTML(product.pairingItem)})` : "페어링 아이템 둘러보기"}</span><span aria-hidden="true">↗</span></a>
        ${barwareButtonHtml}
      </div>
      <p class="affiliate-disclosure">${hasPartnerLink || barware?.isPartner ? "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다." : "일반 상품 검색 링크입니다. 제휴 수수료 추적은 설정 후 활성화됩니다."}</p>`
    : `<span class="pairing-button is-disabled" aria-disabled="true">제휴 링크 준비 중</span>`;
  const priceCheckedOn = product.best.price_checked_on || product.best.collected_at || "확인일 미기록";
  const priceNote = product.best.price_note || "판매처 공개 표시 가격 · 시점에 따라 변동";
  const sourceHref = safeHttpUrl(product.best.market_source_url || "");
  const priceSource = sourceHref !== "#"
    ? `<a class="price-source" href="${escapeHTML(sourceHref)}" target="_blank" rel="nofollow noopener noreferrer">가격 출처: ${escapeHTML(product.best.source_title || product.best.attributes?.listing_label || "판매처 페이지")} ↗</a>`
    : "";

  const isSpotlight = state.spotlightBottleId && state.spotlightBottleId === product.id;
  const spotlightBannerHtml = isSpotlight
    ? `<div class="spotlight-banner">📌 공유된 보틀 픽 · 직링크로 선택된 주류입니다</div>`
    : "";

  return `<article id="bottle-${escapeHTML(product.id)}" class="product-card${isSpotlight ? " is-spotlight" : ""}" style="--card-index:${index}">
    ${bottleArt(product, index, isSaved)}
    <div class="product-content">
      ${spotlightBannerHtml}
      <div class="product-kicker"><span>${escapeHTML(categoryName(product.category))}</span><span>${volume}${grape}</span></div>
      <h3>${escapeHTML(product.name)}</h3>
      <div class="price-row"><div><span class="price-caption">온라인 확인 가격 · ${escapeHTML(priceCheckedOn)}</span><strong class="product-price">${formatPrice(product.best.price)}</strong></div><span class="stock-pill ${product.availableCount ? "is-in" : product.outOfStockCount === product.offers.length ? "is-out" : "is-unknown"}"><i></i>${stockText}</span></div>
      ${pourMetricsHtml}
      <p class="price-context">${escapeHTML(priceNote)}</p>
      ${priceSource}
      ${comparison}
      <div class="pairing-note"><span class="pairing-icon" aria-hidden="true">✳</span><span><small>PAIRING NOTE</small><b>${escapeHTML(product.pairingItem)}</b></span></div>
      ${affiliate}
      <div class="card-actions">
        <button type="button" class="wishlist-button ${isSaved ? "is-saved" : ""}" data-wishlist-toggle="${escapeHTML(product.id)}" aria-pressed="${isSaved}">
          <span class="heart-icon" aria-hidden="true">${isSaved ? "♥" : "♡"}</span>
          <span>${isSaved ? "관심 리스트 담김" : "관심 담기"}</span>
        </button>
        <button type="button" class="review-trigger-button" data-open-review="${escapeHTML(product.id)}">
          <span aria-hidden="true">💬</span>
          <span>리뷰 (${reviewCount})</span>
        </button>
        <button type="button" class="share-bottle-button" data-share-bottle="${escapeHTML(product.id)}" aria-label="${escapeHTML(product.name)} 보틀 직링크 복사">
          <span aria-hidden="true">🔗</span>
          <span>보틀 링크</span>
        </button>
      </div>
      <span class="card-data-note">단일 출처 참고가 · 실시간 가격·재고 아님</span>
    </div>
  </article>`;
}

function getVisibleProducts() {
  const query = state.search.trim().toLocaleLowerCase("ko-KR");
  let products = state.products.filter((product) => {
    if (state.spotlightBottleId && product.id === state.spotlightBottleId && !query && state.category === "all" && state.preset === "all") {
      return true;
    }
    const matchesCategory = state.category === "all" || product.category === state.category;
    const presetOk = matchesPreset(product, state.preset);
    const searchText = [product.name, product.id, categoryName(product.category), product.pairingItem, ...product.offers.map((offer) => offer.attributes?.listing_label || "")].join(" ").toLocaleLowerCase("ko-KR");
    return matchesCategory && presetOk && (!query || searchText.includes(query));
  });
  if (state.sort === "name") {
    products.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } else if (state.sort === "stock") {
    products.sort((a, b) => (b.availableCount > 0) - (a.availableCount > 0) || a.best.price - b.best.price);
  } else if (state.sort === "price_desc") {
    products.sort((a, b) => b.best.price - a.best.price);
  } else if (state.sort === "price") {
    products.sort((a, b) => a.best.price - b.best.price);
  } else {
    // featured: 실제 보틀 사진 보유 상품을 우선 배치하고, 이후 인기/가격순 정렬
    products.sort((a, b) => Boolean(safeProductImage(b.image)) - Boolean(safeProductImage(a.image)) || a.best.price - b.best.price);
  }
  if (state.spotlightBottleId) {
    const spotIdx = products.findIndex((p) => p.id === state.spotlightBottleId);
    if (spotIdx > 0) {
      const [spotItem] = products.splice(spotIdx, 1);
      products.unshift(spotItem);
    }
  }
  return products;
}

function renderCatalog() {
  const allFiltered = getVisibleProducts();
  const visibleSlice = allFiltered.slice(0, state.visibleLimit);
  $("#product-grid").innerHTML = visibleSlice.map(renderProduct).join("");
  $("#product-grid").querySelectorAll(".product-photo").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      image.parentElement.classList.remove("has-product-photo");
      const fallback = image.parentElement.querySelector(".product-art-fallback");
      if (fallback) fallback.hidden = false;
    }, { once: true });
  });
  $("#product-count").textContent = `${String(allFiltered.length).padStart(2, "0")} bottles`;
  $("#catalog-status").textContent = allFiltered.length
    ? `${allFiltered.length}개 상품 중 ${visibleSlice.length}개 표시 · 출처별 확인 가격`
    : "검색 결과가 없습니다.";
  $("#empty-state").hidden = allFiltered.length > 0;

  const paginationWrap = $("#pagination-wrap");
  const loadMoreBtn = $("#load-more-btn");
  const remaining = allFiltered.length - visibleSlice.length;
  if (remaining > 0) {
    paginationWrap.hidden = false;
    loadMoreBtn.textContent = `+ 더 많은 셀렉션 보기 (${remaining}개 남음)`;
  } else {
    paginationWrap.hidden = true;
  }
}

// My List (나의 관심 리스트) UI 및 상태 동기화
function toggleMyList(productId) {
  const id = String(productId || "").trim();
  if (!id) return;
  const idx = state.myList.indexOf(id);
  const product = state.products.find((p) => p.id === id);
  const name = product ? product.name : id;
  if (idx >= 0) {
    state.myList.splice(idx, 1);
    showToast(`'${name}' 상품을 관심 리스트에서 제외했습니다.`);
  } else {
    state.myList.push(id);
    showToast(`'${name}' 상품을 관심 리스트에 담았습니다. ♥`);
  }
  saveMyList();
  syncMyListUI();
  renderCatalog();
}

function syncMyListUI() {
  const savedProducts = state.myList
    .map((id) => state.products.find((p) => p.id === id))
    .filter(Boolean);
  const count = savedProducts.length;

  $("#nav-mylist-count").textContent = String(count);
  $("#floating-mylist-count").textContent = String(count);
  $("#drawer-mylist-count").textContent = `(${count})`;

  const floatingBtn = $("#floating-mylist-btn");
  if (floatingBtn) {
    floatingBtn.hidden = count === 0;
  }

  const emptyEl = $("#mylist-empty");
  const listEl = $("#mylist-items");
  const emailInput = $("#email-mylist");
  const submitBtn = $("#mylist-submit-btn");
  const consentInput = $("#mylist-consent");
  const descEl = $("#mylist-form-desc");

  if (count === 0) {
    emptyEl.hidden = false;
    listEl.innerHTML = "";
    emailInput.disabled = true;
    submitBtn.disabled = true;
    consentInput.disabled = true;
    descEl.textContent = "관심 리스트에 1개 이상의 주류를 담으면 이메일 한 번 입력으로 전체 목록 알림을 신청할 수 있습니다.";
  } else {
    emptyEl.hidden = true;
    emailInput.disabled = false;
    submitBtn.disabled = false;
    consentInput.disabled = false;
    descEl.textContent = `현재 담아둔 ${count}개 주류의 최신 가격·입고 소식을 이메일 하나로 통합 신청합니다.`;
    listEl.innerHTML = savedProducts.map((p) => {
      const img = safeProductImage(p.image, p.id);
      return `<li class="mylist-item">
        <div class="mylist-item-thumb">
          ${img ? `<img src="${escapeHTML(img)}" alt="${escapeHTML(p.name)}" loading="lazy" />` : `<span aria-hidden="true">🍷</span>`}
        </div>
        <div class="mylist-item-info">
          <strong>${escapeHTML(p.name)}</strong>
          <span>${formatPrice(p.best.price)}</span>
          <small>${escapeHTML(p.best.attributes?.listing_label || "확인 판매처")} · 페어링: ${escapeHTML(p.pairingItem)}</small>
        </div>
        <button type="button" class="mylist-remove-btn" data-wishlist-remove="${escapeHTML(p.id)}" aria-label="${escapeHTML(p.name)} 관심 리스트에서 삭제">✕ 삭제</button>
      </li>`;
    }).join("");
  }
}

function openMyListDrawer() {
  syncMyListUI();
  $("#mylist-drawer").hidden = false;
}

function closeMyListDrawer() {
  $("#mylist-drawer").hidden = true;
}

// 커뮤니티 페어링 리뷰(UGC) 렌더링 및 모달 제어
function renderReviewFilters() {
  const counts = new Map();
  for (const r of state.reviews) counts.set(r.category, (counts.get(r.category) || 0) + 1);
  const items = [
    { key: "all", label: "전체", count: state.reviews.length },
    { key: "whisky", label: "위스키", count: counts.get("whisky") || 0 },
    { key: "red_wine", label: "레드 와인", count: counts.get("red_wine") || 0 },
    { key: "sake", label: "사케", count: counts.get("sake") || 0 },
  ];
  $("#review-category-filters").innerHTML = items.map((item) => `
    <button type="button" class="filter-chip ${state.reviewCategory === item.key ? "is-active" : ""}"
      data-review-category="${escapeHTML(item.key)}" aria-pressed="${state.reviewCategory === item.key}">
      ${escapeHTML(item.label)} <span>${String(item.count).padStart(2, "0")}</span>
    </button>`).join("");
}

function renderStars(rating) {
  const r = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function renderReviewsSection() {
  renderReviewFilters();
  const filtered = state.reviewCategory === "all"
    ? state.reviews
    : state.reviews.filter((r) => r.category === state.reviewCategory);

  $("#reviews-grid").innerHTML = filtered.slice(0, 12).map((r) => {
    const resolved = resolveAffiliateLink(r.product_id, r.pairing_snack);
    return `<article class="review-card">
      <div>
        <div class="review-card-top">
          <span class="review-bottle-tag">${escapeHTML(r.product_name)}</span>
          <span class="review-stars" aria-label="별점 5점 만점에 ${Number(r.rating) || 5}점">${renderStars(r.rating)}</span>
        </div>
        <p class="review-comment">“${escapeHTML(r.comment)}”</p>
      </div>
      <div class="review-card-bottom">
        <a class="review-snack-link" href="${escapeHTML(resolved.href)}" target="_blank" rel="${resolved.isPartner ? "sponsored " : ""}nofollow noopener noreferrer">
          <span>🛒 추천 안주: ${escapeHTML(r.pairing_snack)}</span>
          <span aria-hidden="true">쿠팡 보기 ↗</span>
        </a>
        <div class="review-meta">
          <span>by ${escapeHTML(r.nickname || "익명 애호가")}</span>
          <span>${escapeHTML(r.submitted_at || "2026-10")}</span>
        </div>
      </div>
    </article>`;
  }).join("");
}

function populateReviewProductSelect(selectedId = "") {
  const select = $("#review-product-select");
  select.innerHTML = state.products.map((p) => `
    <option value="${escapeHTML(p.id)}" ${p.id === selectedId ? "selected" : ""}>
      [${escapeHTML(categoryName(p.category))}] ${escapeHTML(p.name)}
    </option>`).join("");
}

function openReviewModal(productId = "") {
  const targetId = productId || state.products[0]?.id || "";
  state.activeReviewProductId = targetId;
  populateReviewProductSelect(targetId);
  renderModalProductReviews(targetId);
  $("#review-modal").hidden = false;
}

function closeReviewModal() {
  $("#review-modal").hidden = true;
}

function renderModalProductReviews(productId) {
  const product = state.products.find((p) => p.id === productId);
  const titleEl = $("#review-modal-title");
  titleEl.textContent = product ? `${product.name} · 페어링 노트` : "커뮤니티 페어링 노트";

  const list = state.reviews.filter((r) => r.product_id === productId);
  const container = $("#modal-product-reviews");
  if (!list.length) {
    container.innerHTML = `<div class="modal-review-item"><p>아직 등록된 페어링 후기가 없습니다. 첫 번째 페어링 조합을 남겨보세요!</p></div>`;
    return;
  }
  container.innerHTML = list.map((r) => {
    const resolved = resolveAffiliateLink(r.product_id, r.pairing_snack);
    return `<div class="modal-review-item">
      <div class="review-card-top">
        <strong>${escapeHTML(r.nickname)}</strong>
        <span class="review-stars">${renderStars(r.rating)}</span>
      </div>
      <p>“${escapeHTML(r.comment)}”</p>
      <a class="review-snack-link" href="${escapeHTML(resolved.href)}" target="_blank" rel="${resolved.isPartner ? "sponsored " : ""}nofollow noopener noreferrer">
        <span>🛒 함께 먹은 안주: ${escapeHTML(r.pairing_snack)}</span>
        <span aria-hidden="true">구매처 보기 ↗</span>
      </a>
    </div>`;
  }).join("");
}

async function fetchRemoteReviews() {
  const endpoint = String(emailConfig.endpoint || "").trim();
  if (!endpoint || endpoint === "YOUR_GOOGLE_SCRIPT_URL_HERE" || /docs\.google\.com\/forms/i.test(endpoint)) return;
  try {
    const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}action=reviews`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return;
    const data = await response.json();
    if (data && Array.isArray(data.reviews) && data.reviews.length) {
      const seen = new Set(state.reviews.map((r) => `${r.product_id}|${r.nickname}|${r.comment}`));
      for (const remote of data.reviews) {
        const key = `${remote.product_id}|${remote.nickname}|${remote.comment}`;
        if (!seen.has(key)) {
          seen.add(key);
          state.reviews.unshift(remote);
        }
      }
      renderReviewsSection();
      renderCatalog();
    }
  } catch {
    // 원격 리뷰 로드 실패 시 기본 시드 및 로컬 리뷰 유지
  }
}

async function submitReviewForm(form) {
  const productId = form.elements.product_id.value;
  const product = state.products.find((p) => p.id === productId);
  const nickname = form.elements.nickname.value.trim() || "익명 애호가";
  const rating = Number(form.elements.rating.value) || 5;
  const pairingSnack = form.elements.pairing_snack.value.trim();
  const comment = form.elements.comment.value.trim();

  if (!productId || !pairingSnack || !comment) {
    showToast("안주명과 한줄평을 모두 입력해 주세요.", "is-error");
    return;
  }

  const newReview = {
    submitted_at: new Date().toISOString().slice(0, 10),
    product_id: productId,
    product_name: product ? product.name : productId,
    category: product ? product.category : "other",
    nickname,
    rating,
    pairing_snack: pairingSnack,
    comment,
  };

  // Optimistic UI 반영 및 로컬 저장
  state.reviews.unshift(newReview);
  saveLocalReview(newReview);
  renderReviewsSection();
  renderCatalog();
  renderModalProductReviews(productId);
  form.elements.pairing_snack.value = "";
  form.elements.comment.value = "";
  showToast("페어링 리뷰가 등록되었습니다! 감사합니다.");

  const endpoint = String(emailConfig.endpoint || "").trim();
  if (!endpoint || endpoint === "YOUR_GOOGLE_SCRIPT_URL_HERE" || /docs\.google\.com\/forms/i.test(endpoint)) return;

  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        action: "submit_review",
        ...newReview,
      }),
    });
  } catch (error) {
    console.error("원격 리뷰 전송 실패:", error);
  }
}

function showToast(message, type = "") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast is-visible ${type}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.className = "toast"; }, 3800);
}

async function sendWaitlistPayload({ email, productId, productName, marketingConsent, form, button, successMessage }) {
  const endpoint = String(emailConfig.endpoint || "").trim();
  if (!endpoint || endpoint === "YOUR_GOOGLE_SCRIPT_URL_HERE") {
    showToast("config.js의 email.endpoint에 Google 웹훅 URL을 입력해 주세요.", "is-error");
    return;
  }

  const marketingConsentAt = marketingConsent ? new Date().toISOString() : "";
  const isGoogleForm = /docs\.google\.com\/forms\/.*\/formResponse/i.test(endpoint);
  let headers;
  let body;

  if (isGoogleForm) {
    const emailFieldId = String(emailConfig.googleFormEmailEntryId || "").trim();
    if (!/^entry\.\d+$/.test(emailFieldId)) {
      showToast("config.js에 Google Form 이메일 질문 entry ID를 입력해 주세요.", "is-error");
      return;
    }
    const formBody = new URLSearchParams();
    formBody.set(emailFieldId, email);
    const productFieldId = String(emailConfig.googleFormProductEntryId || "").trim();
    if (/^entry\.\d+$/.test(productFieldId)) {
      formBody.set(productFieldId, productName);
    }
    const consentFieldId = String(emailConfig.googleFormMarketingConsentEntryId || "").trim();
    if (!/^entry\.\d+$/.test(consentFieldId)) {
      showToast("Google Form에 광고성 정보 수신 동의 질문을 만들고 entry ID를 설정해 주세요.", "is-error");
      return;
    }
    formBody.set(consentFieldId, marketingConsent ? "동의" : "미동의");
    const consentAtFieldId = String(emailConfig.googleFormMarketingConsentAtEntryId || "").trim();
    if (marketingConsent && /^entry\.\d+$/.test(consentAtFieldId)) {
      formBody.set(consentAtFieldId, marketingConsentAt);
    }
    headers = { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" };
    body = formBody.toString();
  } else {
    headers = { "Content-Type": "text/plain;charset=UTF-8" };
    body = JSON.stringify({
      email,
      product_id: productId,
      product_name: productName,
      source: "booze-base",
      subscribed_at: new Date().toISOString(),
      marketing_consent: marketingConsent,
      marketing_consent_at: marketingConsentAt,
    });
  }

  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "전송 중…";
  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers,
      body,
    });
    window.alert(successMessage);
    form.reset();
  } catch (error) {
    console.error("알림 신청 전송 실패:", error);
    showToast("전송에 실패했어요. 웹훅 URL과 네트워크를 확인해 주세요.", "is-error");
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function submitHeroSignup(form) {
  const emailInput = form.elements.email;
  const email = emailInput.value.trim();
  if (!emailInput.checkValidity()) {
    emailInput.reportValidity();
    return;
  }
  const consentInput = form.elements.namedItem("marketing_consent");
  const marketingConsent = Boolean(consentInput && consentInput.checked);
  const button = form.querySelector("button[type='submit']");

  await sendWaitlistPayload({
    email,
    productId: form.dataset.productId || "all",
    productName: form.dataset.productName || "전체 입고 알림",
    marketingConsent,
    form,
    button,
    successMessage: marketingConsent
      ? "전체 입고 알림 신청이 완료되었습니다!\n선택한 광고성 정보 수신 동의가 함께 전달되었습니다."
      : "전체 입고 알림 신청이 완료되었습니다!\n광고성 정보 수신 동의는 선택하지 않았습니다.",
  });
}

async function submitMyListSignup(form) {
  const emailInput = form.elements.email;
  const email = emailInput.value.trim();
  if (!emailInput.checkValidity()) {
    emailInput.reportValidity();
    return;
  }
  const savedProducts = state.myList
    .map((id) => state.products.find((p) => p.id === id))
    .filter(Boolean);
  if (!savedProducts.length) {
    showToast("관심 리스트에 최소 1개 이상의 주류를 먼저 담아주세요.", "is-error");
    return;
  }

  const productIds = savedProducts.map((p) => p.id).join(", ");
  const productNames = savedProducts.map((p) => p.name).join(", ");
  const consentInput = form.elements.namedItem("marketing_consent");
  const marketingConsent = Boolean(consentInput && consentInput.checked);
  const button = form.querySelector("button[type='submit']");

  await sendWaitlistPayload({
    email,
    productId: productIds,
    productName: productNames,
    marketingConsent,
    form,
    button,
    successMessage: `내 관심 리스트 (${savedProducts.length})개 상품의 정보 업데이트 알림 신청이 완료되었습니다!`,
  });
}

async function copyBottleDeepLink(productId) {
  const id = String(productId || "").trim();
  if (!id) return;
  const product = state.products.find((p) => p.id === id);
  const name = product ? product.name : id;
  const baseUrl = window.location.origin && window.location.origin !== "null"
    ? `${window.location.origin}${window.location.pathname}`
    : "https://boozebase.netlify.app/";
  const shareUrl = `${baseUrl}?bottle=${encodeURIComponent(id)}#collection`;

  state.spotlightBottleId = id;
  renderCatalog();

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      showToast(`🔗 '${name}' 전용 직링크가 복사되었습니다! 블로그·카톡에 바로 붙여넣으세요.`);
      return;
    }
  } catch {
    // clipboard API 권한 제한 시 fallback
  }
  window.prompt(`'${name}' 보틀 공유 직링크입니다 (Ctrl+C로 복사):`, shareUrl);
}

function applyUrlParamsOnLoad() {
  try {
    const params = new URLSearchParams(window.location.search);
    const bottleParam = (params.get("bottle") || "").trim();
    const presetParam = (params.get("preset") || "").trim();
    const categoryParam = (params.get("category") || "").trim();
    const queryParam = (params.get("q") || "").trim();

    if (categoryParam && (categoryParam === "all" || categoryLabels[categoryParam])) {
      state.category = categoryParam;
    }
    if (presetParam && CURATION_PRESETS.some((p) => p.key === presetParam)) {
      state.preset = presetParam;
    }
    if (queryParam) {
      state.search = queryParam;
      const searchEl = $("#search-input");
      if (searchEl) searchEl.value = queryParam;
    }
    if (bottleParam) {
      const target = state.products.find((p) => p.id === bottleParam);
      if (target) {
        state.spotlightBottleId = target.id;
        window.setTimeout(() => {
          const cardEl = document.getElementById(`bottle-${target.id}`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 180);
      }
    }
  } catch {
    // URL 파라미터 파싱 실패 시 무시
  }
}

async function init() {
  $("#current-year").textContent = new Date().getFullYear();

  // 150ms 디바운스 검색
  let searchTimer = null;
  $("#search-input").addEventListener("input", (event) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.search = event.target.value;
      state.visibleLimit = PAGE_SIZE;
      renderCatalog();
    }, 150);
  });

  $("#sort-select").addEventListener("change", (event) => {
    state.sort = event.target.value;
    state.visibleLimit = PAGE_SIZE;
    renderCatalog();
  });

  $("#category-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    state.visibleLimit = PAGE_SIZE;
    renderFilters();
    renderCatalog();
  });

  const presetContainer = $("#preset-filters");
  if (presetContainer) {
    presetContainer.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preset]");
      if (!button) return;
      state.preset = button.dataset.preset;
      state.visibleLimit = PAGE_SIZE;
      renderPresets();
      renderCatalog();
    });
  }

  $("#load-more-btn").addEventListener("click", () => {
    state.visibleLimit += PAGE_SIZE;
    renderCatalog();
  });

  // 상품 카드 내 찜하기(My List), 리뷰 모달 & 보틀 직링크 복사 이벤트 위임
  $("#product-grid").addEventListener("click", (event) => {
    const wishBtn = event.target.closest("[data-wishlist-toggle]");
    if (wishBtn) {
      toggleMyList(wishBtn.dataset.wishlistToggle);
      return;
    }
    const reviewBtn = event.target.closest("[data-open-review]");
    if (reviewBtn) {
      openReviewModal(reviewBtn.dataset.openReview);
      return;
    }
    const shareBtn = event.target.closest("[data-share-bottle]");
    if (shareBtn) {
      copyBottleDeepLink(shareBtn.dataset.shareBottle);
    }
  });

  // 상단/히어로/하단/플로팅 My List 열기·닫기
  $("#open-mylist-btn").addEventListener("click", openMyListDrawer);
  $("#hero-open-mylist").addEventListener("click", openMyListDrawer);
  $("#closing-open-mylist").addEventListener("click", openMyListDrawer);
  $("#floating-mylist-btn").addEventListener("click", openMyListDrawer);
  $("#close-mylist-btn").addEventListener("click", closeMyListDrawer);
  $("#mylist-drawer").addEventListener("click", (event) => {
    if (event.target === $("#mylist-drawer")) closeMyListDrawer();
    const removeBtn = event.target.closest("[data-wishlist-remove]");
    if (removeBtn) toggleMyList(removeBtn.dataset.wishlistRemove);
  });

  // 리뷰 섹션 필터 & 리뷰 모달 열기·닫기
  $("#review-category-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-category]");
    if (!button) return;
    state.reviewCategory = button.dataset.reviewCategory;
    renderReviewsSection();
  });
  $("#open-general-review-btn").addEventListener("click", () => openReviewModal(""));
  $("#close-review-modal-btn").addEventListener("click", closeReviewModal);
  $("#review-modal").addEventListener("click", (event) => {
    if (event.target === $("#review-modal")) closeReviewModal();
  });
  $("#review-product-select").addEventListener("change", (event) => {
    renderModalProductReviews(event.target.value);
  });
  $("#review-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitReviewForm(event.target);
  });

  // 알림 신청 폼 제출 (상단 히어로 + My List 드로어 통합 폼)
  $("#top-alert").addEventListener("submit", (event) => {
    if (!event.target.matches(".signup-form")) return;
    event.preventDefault();
    submitHeroSignup(event.target);
  });
  $("#mylist-signup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitMyListSignup(event.target);
  });

  $("#reset-filters").addEventListener("click", () => {
    state.category = "all";
    state.preset = "all";
    state.spotlightBottleId = "";
    state.search = "";
    state.visibleLimit = PAGE_SIZE;
    $("#search-input").value = "";
    renderFilters();
    renderCatalog();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#search-input").focus();
    } else if (event.key === "Escape") {
      closeMyListDrawer();
      closeReviewModal();
    }
  });

  try {
    const response = await fetch("./liquor_data.json?v=20261102-500bottles", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("liquor_data.json 형식이 배열이 아닙니다.");
    state.products = makeProducts(rows);
    applyUrlParamsOnLoad();
    renderFilters();
    renderCatalog();
    renderBarwareShowcase();
    syncMyListUI();
    renderReviewsSection();
    fetchRemoteReviews();
  } catch (error) {
    console.error("주류 가격 데이터를 읽지 못했습니다:", error);
    $("#product-count").textContent = "데이터를 불러오지 못했어요";
    $("#catalog-status").textContent = "liquor_data.json을 불러오지 못했습니다. 로컬 HTTP 서버에서 다시 열어주세요.";
    $("#product-grid").innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", init);
