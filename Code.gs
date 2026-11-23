/**
 * Booze Base — Google Sheets 대기목록(My List 통합 알림) 수집기, 유저 페어링 리뷰(Reviews) API 및 수동 광고성 이메일 발송기
 * 기존 doPost(e)의 이메일 검증·시트 기록 동작을 유지하고, 다중 상품(My List) 쉼표 문자열 및 Reviews 시트 저장/조회를 지원합니다.
 * 상품 가격/출처/페어링은 liquor_data.json 스냅샷, 제휴 URL은 config.js 기준입니다.
 */
const SHEET_NAME = "Waitlist";
const REVIEWS_SHEET_NAME = "Reviews";
const HEADERS = [
  "submitted_at",
  "email",
  "product_id",
  "product_name",
  "source",
  "marketing_consent",
  "marketing_consent_at",
  "notified_at",
];
const REVIEW_HEADERS = [
  "submitted_at",
  "product_id",
  "product_name",
  "category",
  "nickname",
  "rating",
  "pairing_snack",
  "comment",
  "status",
];
const SEND_TIMEZONE = "Asia/Seoul";
// 기본 차단: 운영자는 주류 면허 보유자가 아니라고 안내했습니다. 해당 주류 콘텐츠의 광고성 발송이 허용된다는 서면 법률 검토 후에만 true로 변경하세요.
var ALCOHOL_AD_EMAILS_AUTHORIZED = false;
const FEATURED_FOR_ALL = [
  "andre-goichot-bourgogne-pinot-noir",
  "glenlivet-founders-reserve",
  "dassai-23",
];

// 2026-10-15 조사 스냅샷입니다. 실제 재고를 자동 확인하지 않으며 발송 전 운영자가 판매처에서 확인해야 합니다.
const PRODUCT_CATALOG = {
  "yoichi-single-malt": { name: "닛카 요이치 싱글몰트", price: 141900, checked: "2026-10-15", source: "키햐", sourceTitle: "[세금포함] 닛카 싱글몰트 요이치 700ml", sourceUrl: "https://m.kihya.com/goods/goods_view.php?goodsNo=1000006311", note: "키햐 표시가(세금 포함). 쿠폰 적용가는 포함하지 않았습니다.", pairing: "훈연 향을 살려 주는 훈제 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "dewars-double-double-20": { name: "듀어스 더블더블 20년", price: 100401, checked: "2026-10-15", source: "신라면세점 (면세가)", sourceTitle: "듀어스 | 신라인터넷면세점 브랜드 상품 목록", sourceUrl: "https://www.shilladfs.com/estore/kr/ko/b/dewars", note: "신라면세점 표시 면세가입니다. 일반 국내 주류 소매가와 다를 수 있습니다.", pairing: "카카오 함량이 높은 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUE4OWm1oO" },
  "andre-goichot-bourgogne-pinot-noir": { name: "앙드레 고이쇼 부르고뉴 피노 누아", price: 42000, checked: "2026-10-15", source: "보틀라운지 (데일리샷 픽업)", sourceTitle: "Andre Goichot Bourgogne Pinot Noir — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/28450", note: "보틀라운지의 데일리샷 공개가. 페이지에 빈티지 미지정 안내가 있습니다.", pairing: "버섯을 곁들인 구운 오리 가슴살", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "glenlivet-founders-reserve": { name: "더 글렌리벳 파운더스 리저브", price: 54900, checked: "2026-10-15", source: "CU 강남푸르지오점 (예약 픽업)", sourceTitle: "The Glenlivet Founder's Reserve — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/4967", note: "CU 강남푸르지오점 예약 픽업가. 조사일 페이지에 10월 20일 픽업 가능으로 표시됐습니다.", pairing: "말린 살구와 아몬드", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "redbreast-12": { name: "레드브레스트 12년", price: 77000, checked: "2026-10-15", source: "보틀즈 논현 (데일리샷 픽업)", sourceTitle: "Red breast 12yo 레드 브레스트 12년 — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/5295", note: "보틀즈 논현의 데일리샷 표시가. 조사일 페이지에 2개 남음으로 표시됐습니다.", pairing: "다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFAMBL2n6" },
  "glenfiddich-15-solera": { name: "글렌피딕 15년 솔레라 리저브", price: 99000, checked: "2026-10-15", source: "보틀하우스 (데일리샷 픽업)", sourceTitle: "Glenfiddich 15yo 글렌피딕 15년 — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/1650", note: "보틀하우스 픽업 판매가. 조사일 페이지에 3개 남음으로 표시됐습니다.", pairing: "숙성 체다 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "macallan-12-sherry-oak": { name: "맥캘란 12년 셰리 오크", price: 129900, checked: "2026-10-15", source: "보틀하우스 (데일리샷 픽업)", sourceTitle: "Macallan 12yo Sherry Oak 맥캘란 12년 — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/30021", note: "보틀하우스 픽업 판매가. 조사일 페이지에 6개 남음으로 표시됐습니다.", pairing: "카카오 함량이 높은 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "hakushu-distillers-reserve": { name: "하쿠슈 디스틸러스 리저브", price: 263900, checked: "2026-10-15", source: "키햐 (세금 포함)", sourceTitle: "[세금포함] 하쿠슈 DR(케이스 포함) 700ml", sourceUrl: "https://m.kihya.com/goods/goods_view.php?goodsNo=1000011610", note: "키햐 세금 포함 표시가. 매장·지역 선택에 따라 재고 확인이 필요합니다.", pairing: "소금으로 간한 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "glenallachie-12": { name: "글렌알라키 12년", price: 143000, checked: "2026-10-15", source: "키햐 (제휴 픽업 판매처)", sourceTitle: "글렌알라키 12년 — 키햐", sourceUrl: "https://m.kihya.com/goods/goods_view.php?goodsNo=1000015663", note: "키햐 제휴 픽업 표시가. 매장·지역에 따라 가격과 재고를 다시 확인하세요.", pairing: "다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "junmai-ginjo-omachi": { name: "타비카 준마이긴죠 오마치", price: 64900, checked: "2026-10-15", source: "키햐", sourceTitle: "타비카 준마이긴죠 오마치 — 키햐", sourceUrl: "https://m.kihya.com/goods/goods_view.php?goodsNo=1000004427", note: "키햐 공개 프로모션가(표시 정상가 69,000원). 추가 쿠폰은 미적용했습니다.", pairing: "간장 양념 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFS3dZ8SW" },
  "dassai-23": { name: "닷사이 23 준마이다이긴죠", price: 89500, checked: "2026-10-15", source: "하바루 (데일리샷 공동구매)", sourceTitle: "Dassai Junmai Daiginjo 23 닷사이 23 — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/4973", note: "2026-10-15 당시 D-6 공동구매가. 기간 종료 뒤에는 판매가·구매 가능 여부를 재확인하세요.", pairing: "광어회", affiliateUrl: "https://link.coupang.com/a/hTVuCpW2tG" },
  "kubota-manju": { name: "쿠보타 만쥬 준마이다이긴죠", price: 139000, checked: "2026-10-15", source: "일만와인상회 (품절)", sourceTitle: "쿠보타 만쥬 720ml — 일만와인상회", sourceUrl: "https://10000wine.co.kr/product/%EC%BF%A0%EB%B3%B4%ED%83%80-%EB%A7%8C%EC%A5%AC-720ml/1568/", note: "마지막 게시가입니다. 판매처 페이지에 SOLD OUT 표시가 있습니다.", pairing: "흰살생선 사시미", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "hakkaisan-junmai-daiginjo": { name: "핫카이산 준마이다이긴죠", price: 56900, checked: "2026-10-15", source: "키햐", sourceTitle: "핫카이산 준마이 다이긴죠 720ml — 키햐", sourceUrl: "https://m.kihya.com/goods/goods_view.php?goodsNo=1000002362", note: "할인 표시가 56,900원(표시 정가 79,000원). 재고는 명시되지 않았습니다.", pairing: "흰살생선 소금구이", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "louis-jadot-bourgogne-pinot-noir": { name: "루이 자도 부르고뉴 피노 누아", price: 44900, checked: "2026-10-15", source: "데일리샷 (국밥쟁이 강남역점)", sourceTitle: "Louis Jadot Bourgogne Pinot Noir — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/3680", note: "할인 표시가 44,900원(기준가 55,000원). 재고 표시는 없습니다.", pairing: "오리 스테이크", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "montes-alpha-carmenere": { name: "몬테스 알파 까르미네르", price: 32000, checked: "2026-10-15", source: "나라셀라 리저브 (데일리샷)", sourceTitle: "Montes Alpha Carmenere — 데일리샷", sourceUrl: "https://dailyshot.co/m/item/26062", note: "나라셀라 리저브의 데일리샷 표시가. 조사일 페이지에 2개 남음으로 표시됐습니다.", pairing: "허브를 곁들인 구운 양고기", affiliateUrl: "https://link.coupang.com/a/hUGi2vPhcG" },
  "balvenie-12-doublewood": { name: "발베니 12년 더블우드", price: 112000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 발베니 12년 더블우드", sourceUrl: "https://dailyshot.co/m/item/3190", note: "버번·셰리 캐스크 숙성 싱글몰트. 데일리샷 스마트오더 픽업 참고가 기준.", pairing: "꿀을 곁들인 무화과 & 브리 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "balvenie-14-caribbean-cask": { name: "발베니 14년 캐리비안 캐스크", price: 165000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 발베니 14년 캐리비안 캐스크", sourceUrl: "https://dailyshot.co/m/item/3190", note: "럼 캐스크 피니시 열대과일 풍미. 데일리샷 픽업 참고가 기준.", pairing: "구운 파인애플 & 카카오 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "balvenie-16-french-oak": { name: "발베니 16년 프렌치 오크", price: 275000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 발베니 16년 프렌치 오크", sourceUrl: "https://dailyshot.co/m/item/6910", note: "피노 드 샤랑트 캐스크 피니시. 키햐 픽업 참고가 기준.", pairing: "살구 타르트 & 구운 아몬드 믹스넛", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "hibiki-japanese-harmony": { name: "산토리 히비키 자패니즈 하모니", price: 152000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 산토리 히비키 하모니", sourceUrl: "https://dailyshot.co/m/item/2981", note: "일본 대표 블렌디드 위스키. 데일리샷 픽업 참고가 기준.", pairing: "하몽 멜론 & 스모크 훈제 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "hibiki-blenders-choice": { name: "산토리 히비키 블렌더스 초이스", price: 259000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 히비키 블렌더스 초이스", sourceUrl: "https://dailyshot.co/m/item/2981", note: "와인 캐스크 숙성 원액 블렌딩. 키햐 표시 참고가 기준.", pairing: "소고기 채끝 스테이크 & 숙성 고다 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "yamazaki-12": { name: "산토리 야마자키 12년 싱글몰트", price: 289000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 산토리 야마자키 12년", sourceUrl: "https://dailyshot.co/m/item/3240", note: "미즈나라 오크 향이 돋보이는 일본 대표 싱글몰트.", pairing: "프리미엄 생초콜릿 & 구운 마카다미아", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "yamazaki-distillers-reserve": { name: "산토리 야마자키 디스틸러스 리저브", price: 159000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 야마자키 DR", sourceUrl: "https://dailyshot.co/m/item/2981", note: "레드 와인 캐스크와 셰리 캐스크 원액 블렌딩.", pairing: "다크 초콜릿 브라우니 & 구운 호두", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "macallan-12-double-cask": { name: "맥캘란 12년 더블 캐스크", price: 118000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 맥캘란 12년 더블 캐스크", sourceUrl: "https://dailyshot.co/m/item/2328", note: "아메리칸·유러피언 셰리 오크의 조화. 데일리샷 픽업 참고가.", pairing: "피칸 타르트 & 구운 아몬드 견과류", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "macallan-15-double-cask": { name: "맥캘란 15년 더블 캐스크", price: 238000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 맥캘란 15년 더블 캐스크", sourceUrl: "https://dailyshot.co/m/item/2328", note: "구운 사과와 시나몬 스파이스 풍미. 데일리샷 픽업 참고가.", pairing: "무화과 프로슈토 & 카카오 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "macallan-18-sherry-oak": { name: "맥캘란 18년 셰리 오크", price: 620000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 맥캘란 18년 셰리 오크", sourceUrl: "https://dailyshot.co/m/item/23305", note: "올로로소 셰리 오크 숙성의 정점. 데일리샷 참고가.", pairing: "이베리코 하몽 & 숙성 파르미지아노 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "glenfiddich-12": { name: "글렌피딕 12년 싱글몰트", price: 66900, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "글렌피딕 12년 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/9314", note: "서양배의 싱그러운 과실 향. 편의점 스마트오더 참고가.", pairing: "서양배 슬라이스 & 브리 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "glenfiddich-18": { name: "글렌피딕 18년 스몰배치 리저브", price: 179000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌피딕 18년", sourceUrl: "https://dailyshot.co/m/item/3164", note: "구운 사과와 깊은 오크 풍미. 데일리샷 픽업 참고가.", pairing: "호두 타르트 & 진한 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "glenmorangie-original-10": { name: "글렌모렌지 오리지널 10년", price: 69000, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "글렌모렌지 오리지널 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/8680", note: "화사한 시트러스와 바닐라 아로마. 스마트오더 참고가.", pairing: "오렌지 마카롱 디저트 & 구운 아몬드", affiliateUrl: "https://link.coupang.com/a/hUFAMBL2n6" },
  "glenmorangie-signet": { name: "글렌모렌지 시그넷", price: 319000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌모렌지 시그넷", sourceUrl: "https://dailyshot.co/m/item/4141", note: "초콜릿 몰트 로스팅으로 완성한 모카·다크초콜릿 풍미.", pairing: "에스프레소 생초콜릿 & 구운 헤이즐넛", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "dalmore-12": { name: "달모어 12년 싱글몰트", price: 115000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 달모어 12년", sourceUrl: "https://dailyshot.co/m/item/3167", note: "올로로소 셰리 캐스크 피니시의 오렌지·초콜릿 노트.", pairing: "오렌지 필 & 카카오 80% 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "dalmore-15": { name: "달모어 15년 싱글몰트", price: 189000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 달모어 15년", sourceUrl: "https://dailyshot.co/m/item/2354", note: "아포스톨레스·마투살렘 셰리 캐스크 숙성. 키햐 참고가.", pairing: "무화과 살라미 & 숙성 체다 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "dalmore-king-alexander-iii": { name: "달모어 킹 알렉산더 3세", price: 365000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 달모어 킹 알렉산더 3세", sourceUrl: "https://dailyshot.co/m/item/3170", note: "6가지 서로 다른 캐스크 숙성 원액의 화려한 블렌딩.", pairing: "한우 안심 스테이크 & 트러플 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "aberlour-12-double-cask": { name: "아벨라워 12년 더블 캐스크", price: 95000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 아벨라워 12년", sourceUrl: "https://dailyshot.co/m/item/3238", note: "스페이사이드 정통 셰리·버번 더블 캐스크 싱글몰트.", pairing: "사과 타르트 & 구운 피칸 믹스넛", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "glenallachie-10-cask-strength": { name: "글렌알라키 10년 캐스크 스트렝스", price: 149000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌알라키 10년 CS", sourceUrl: "https://dailyshot.co/m/item/10920", note: "빌리 워커의 시그니처 고도수 셰리 폭탄 싱글몰트.", pairing: "진한 카카오 다크 초콜릿 & 피칸 견과", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "lagavulin-16": { name: "라가불린 16년 아일라 싱글몰트", price: 158000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 라가불린 16년", sourceUrl: "https://dailyshot.co/m/item/1679", note: "중후한 피트 스모크와 셰리 단맛의 아일라 클래식.", pairing: "고르곤졸라 치즈 & 훈제 소고기 육포", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "laphroaig-10": { name: "라프로익 10년 아일라 싱글몰트", price: 86000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 라프로익 10년", sourceUrl: "https://dailyshot.co/m/item/7699", note: "강렬한 바다 요오드와 메디시널 피트 스모크.", pairing: "석화 생굴 플레이트 & 훈제 연어", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "ardbeg-10": { name: "아드벡 10년 아일라 싱글몰트", price: 94000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 아드벡 10년", sourceUrl: "https://dailyshot.co/m/item/3195", note: "강렬한 토탄 향 뒤에 올라오는 레몬·라임 시트러스 단맛.", pairing: "양갈비 스테이크 & 스모크 훈제 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "bowmore-12": { name: "보모어 12년 아일라 싱글몰트", price: 78000, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "보모어 12년 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/3192", note: "다크 초콜릿과 은은한 피트 연기가 어우러진 아일라 입문용.", pairing: "훈제 굴 카나페 & 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "talisker-10": { name: "탈리스커 10년 싱글몰트", price: 74900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 탈리스커 10년", sourceUrl: "https://dailyshot.co/m/item/1961", note: "스카이섬의 거친 바닷바람과 스파이시 페퍼 피니시.", pairing: "통후추 올린 생굴 & 훈제 연어 사시미", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "kavalan-solist-oloroso-sherry": { name: "카발란 솔리스트 올로로소 셰리 CS", price: 245000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 카발란 솔리스트 올로로소", sourceUrl: "https://dailyshot.co/m/item/4330", note: "대만 아열대 숙성이 만든 말린 과일·견과류 셰리 풍미.", pairing: "이베리코 하몽 & 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "johnnie-walker-blue-label": { name: "조니워커 블루 라벨", price: 269000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 조니워커 블루 라벨", sourceUrl: "https://dailyshot.co/m/item/30226", note: "희귀 원액만을 블렌딩한 벨벳 같은 텍스처와 긴 여운.", pairing: "한우 채끝 스테이크 & 트러플 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "royal-salute-21-signature": { name: "로얄살루트 21년 시그니처 블렌드", price: 229000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 로얄살루트 21년", sourceUrl: "https://dailyshot.co/m/item/3208", note: "21년 이상 숙성 원액만 사용한 묵직한 과실·오크 블렌드.", pairing: "소고기 안심 스테이크 & 숙성 고다 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "wild-turkey-101-8": { name: "와일드터키 101 8년 버번", price: 68000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 와일드터키 101 8년", sourceUrl: "https://dailyshot.co/m/item/2947", note: "50.5도 고도수가 주는 진한 바닐라·카라멜·오크 스파이스.", pairing: "훈제 바비큐 폭립 & 체다 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUGi2vPhcG" },
  "makers-mark": { name: "메이커스 마크 버번 위스키", price: 54000, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "메이커스 마크 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/10538", note: "겨울 밀을 사용해 부드럽고 달콤한 레드 왁스 봉인 버번.", pairing: "피칸 타르트 디저트 & 구운 아몬드", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "buffalo-trace": { name: "버팔로 트레이스 버번 위스키", price: 49900, checked: "2026-10-15", source: "이마트 트레이더스", sourceTitle: "버팔로 트레이스 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/3281", note: "바닐라와 민트 당밀의 밸런스가 뛰어난 데일리 버번.", pairing: "다크 초콜릿 브라우니 & 구운 호두 견과", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "1865-selected-vineyards-cabernet-sauvignon": { name: "1865 셀렉티드 빈야드 카베르네 소비뇽", price: 34900, checked: "2026-10-15", source: "이마트 트레이더스", sourceTitle: "1865 카베르네 소비뇽 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/5033", note: "한국인이 가장 사랑하는 칠레 마이포 밸리 풀바디 레드 와인.", pairing: "한우 등심 스테이크 & 그릴 버섯", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "the-prisoner-red-blend": { name: "더 프리즈너 레드 블렌드 나파밸리", price: 89000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 더 프리즈너 레드 블렌드", sourceUrl: "https://dailyshot.co/m/item/11923", note: "진판델 베이스의 농밀한 검은 과실과 바닐라·모카 풍미.", pairing: "양갈비 프렌치랙 스테이크 & 이베리코 하몽", affiliateUrl: "https://link.coupang.com/a/hUGi2vPhcG" },
  "caymus-napa-valley-cabernet-sauvignon": { name: "케이머스 나파밸리 카베르네 소비뇽", price: 148000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 케이머스 카베르네 소비뇽", sourceUrl: "https://dailyshot.co/m/item/4114", note: "나파밸리의 상징적인 벨벳 탄닌과 진한 다크 체리·카카오 노트.", pairing: "드라이에이징 티본 스테이크 & 숙성 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "opus-one-napa-valley": { name: "오퍼스 원 나파밸리", price: 590000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 오퍼스 원", sourceUrl: "https://dailyshot.co/m/item/17370", note: "로버트 몬다비와 바롱 필립 드 로칠드가 탄생시킨 나파밸리 아이콘.", pairing: "한우 안심 스테이크 & 파르미지아노 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "duckhorn-napa-valley-merlot": { name: "덕혼 나파밸리 멀롯", price: 79000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 덕혼 나파밸리 멀롯", sourceUrl: "https://dailyshot.co/m/item/4098", note: "풍부한 자두·블랙체리와 실키한 텍스처의 나파 멀롯 정석.", pairing: "구운 오리 가슴살 스테이크 & 트러플 치즈", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "bread-and-butter-pinot-noir": { name: "브레드 앤 버터 피노 누아", price: 29800, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "브레드 앤 버터 피노 누아 판매처", sourceUrl: "https://dailyshot.co/m/item/3755", note: "잘 익은 라즈베리와 은은한 오크 바닐라가 편안한 캘리포니아 피노 누아.", pairing: "잠봉 뵈르 카나페 & 브리 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "bread-and-butter-cabernet-sauvignon": { name: "브레드 앤 버터 카베르네 소비뇽", price: 29800, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "브레드 앤 버터 카베르네 소비뇽 판매처", sourceUrl: "https://dailyshot.co/m/item/3754", note: "모카와 구운 오크 블랙베리가 조화로운 데일리 미국 레드 와인.", pairing: "소고기 부채살 스테이크 & 체다 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "twomey-cellars-pinot-noir": { name: "투미 바이 실버오크 피노 누아", price: 98000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 투미 피노 누아", sourceUrl: "https://dailyshot.co/m/item/26949", note: "실버오크 와이너리가 선보이는 섬세하고 우아한 러시안 리버 밸리 피노 누아.", pairing: "오리 스테이크 & 프로슈토 하몽 플래터", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "silver-oak-alexander-valley-cabernet": { name: "실버오크 알렉산더 밸리 카베르네 소비뇽", price: 145000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 실버오크 알렉산더 밸리", sourceUrl: "https://dailyshot.co/m/item/4114", note: "아메리칸 오크 숙성 특유의 코코넛·바닐라·블랙커런트 풍미.", pairing: "소고기 등심 스테이크 & 고르곤졸라 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "mollydooker-the-boxer-shiraz": { name: "몰리두커 더 복서 쉬라즈", price: 48000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 몰리두커 더 복서", sourceUrl: "https://dailyshot.co/m/item/5842", note: "호주 남부 쉬라즈의 진한 자두·다크초콜릿·스파이스 폭탄.", pairing: "훈제 바비큐 폭립 & 페퍼 살라미 플래터", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "penfolds-bin-389-cabernet-shiraz": { name: "펜폴즈 빈 389 카베르네 쉬라즈", price: 99000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 펜폴즈 빈 389", sourceUrl: "https://dailyshot.co/m/item/4768", note: "베이비 그란지라 불리는 호주 대표 카베르네·쉬라즈 블렌드.", pairing: "양갈비 스테이크 & 숙성 고다 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "banfi-brunello-di-montalcino": { name: "반피 브루넬로 디 몬탈치노", price: 85000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 반피 브루넬로 디 몬탈치노", sourceUrl: "https://dailyshot.co/m/item/16921", note: "이탈리아 토스카나 산지오베제의 중후한 가죽·체리·발사믹 부케.", pairing: "티본 스테이크 & 이베리코 하몽 프로슈토", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "antinori-tignanello": { name: "안티노리 티냐넬로 슈퍼투스칸", price: 215000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 안티노리 티냐넬로", sourceUrl: "https://dailyshot.co/m/item/12497", note: "슈퍼투스칸의 효시. 산지오베제와 카베르네의 압도적인 구조감.", pairing: "한우 채끝 스테이크 & 파르미지아노 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "cloudy-bay-sauvignon-blanc": { name: "클라우디 베이 소비뇽 블랑", price: 48900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 클라우디 베이 소비뇽 블랑", sourceUrl: "https://dailyshot.co/m/item/8758", note: "뉴질랜드 말보로 소비뇽 블랑의 대명사. 패션프루트와 싱그러운 허브 산미.", pairing: "석화 생굴 플레이트 & 레몬 버터 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "kim-crawford-marlborough-sauvignon-blanc": { name: "킴 크로포드 말보로 소비뇽 블랑", price: 24900, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "킴 크로포드 소비뇽 블랑 판매처", sourceUrl: "https://dailyshot.co/m/item/3692", note: "자몽과 구스베리의 톡 터지는 산미가 해산물과 완벽히 어울리는 화이트.", pairing: "새우 감바스 알 아히요 & 그린 올리브", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "oyster-bay-sauvignon-blanc": { name: "오이스터 베이 소비뇽 블랑", price: 22900, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "오이스터 베이 소비뇽 블랑 판매처", sourceUrl: "https://dailyshot.co/m/item/3687", note: "이름 그대로 굴·조개류·흰살생선회와 최고의 궁합을 자랑하는 화이트 와인.", pairing: "광어 사시미 카르파초 & 해산물 샐러드", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "bread-and-butter-chardonnay": { name: "브레드 앤 버터 샤르도네", price: 29800, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "브레드 앤 버터 샤르도네 판매처", sourceUrl: "https://dailyshot.co/m/item/3753", note: "구운 브리오슈와 고소한 버터·바닐라 풍미가 가득한 크리미한 샤르도네.", pairing: "버터 갈릭 새우 해산물 & 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "kendall-jackson-vintners-reserve-chardonnay": { name: "켄달 잭슨 빈트너스 리저브 샤르도네", price: 32900, checked: "2026-10-15", source: "이마트 트레이더스", sourceTitle: "켄달 잭슨 샤르도네 판매처", sourceUrl: "https://dailyshot.co/m/item/5249", note: "미국 판매 1위 샤르도네. 망고·파인애플 열대과일과 토스티한 오크 터치.", pairing: "연어 스테이크 & 크림 치즈 카나페", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "william-fevre-chablis": { name: "윌리엄 페브르 샤블리", price: 54000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 윌리엄 페브르 샤블리", sourceUrl: "https://dailyshot.co/m/item/5300", note: "부르고뉴 샤블리 특유의 부싯돌 미네랄리티와 드라이한 시트러스 피니시.", pairing: "생굴 하프쉘 & 흰살생선 광어회", affiliateUrl: "https://link.coupang.com/a/hTVuCpW2tG" },
  "la-spinetta-bricco-quaglia-moscato-dasti": { name: "라 스피네따 브리꼬 콸리아 모스카토 다스티", price: 36000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 라 스피네따 모스카토 다스티", sourceUrl: "https://dailyshot.co/m/item/4111", note: "3대 모스카토 다스티. 섬세한 기포와 복숭아·아카시아 꿀의 우아한 당도.", pairing: "제철 과일 타르트 & 마카롱 디저트", affiliateUrl: "https://link.coupang.com/a/hUFAMBL2n6" },
  "moet-chandon-imperial-brut": { name: "모엣 & 샹동 임페리얼 브뤼 샴페인", price: 69900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 모엣 & 샹동 임페리얼", sourceUrl: "https://dailyshot.co/m/item/4216", note: "풋사과와 브리오슈 향이 조화로운 세계에서 가장 사랑받는 축하 샴페인.", pairing: "브리 치즈 크래커 & 훈제 연어 카나페", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "veuve-clicquot-yellow-label": { name: "뵈브 클리코 옐로우 라벨 브뤼 샴페인", price: 82000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 뵈브 클리코 옐로우 라벨", sourceUrl: "https://dailyshot.co/m/item/10970", note: "피노 누아 비중이 높아 구조감이 탄탄하고 구운 식빵 풍미가 깊은 샴페인.", pairing: "하몽 멜론 & 파르미지아노 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "dom-perignon-vintage": { name: "돔 페리뇽 빈티지 샴페인", price: 359000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 돔 페리뇽 빈티지", sourceUrl: "https://dailyshot.co/m/item/20031", note: "최고의 작황 해에만 생산되는 프레스티지 빈티지 샴페인의 대명사.", pairing: "석화 생굴 & 숙성 광어 사시미", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "ruinart-blanc-de-blancs": { name: "루이나 블랑 드 블랑 샴페인", price: 159000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 루이나 블랑 드 블랑", sourceUrl: "https://dailyshot.co/m/item/4268", note: "샤르도네 100%로 빚은 실키한 기포와 백도·레몬 제스트의 순수한 우아함.", pairing: "가리비 관자 버터구이 해산물 & 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "freixenet-cordon-negro-cava": { name: "프레시넷 꼬르동 네그로 까바 브뤼", price: 19900, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "프레시넷 꼬르동 네그로 판매처", sourceUrl: "https://dailyshot.co/m/item/28256", note: "전통 샴페인 방식으로 양조해 가성비가 뛰어난 스페인 대표 스파클링 와인.", pairing: "그린 올리브 & 새우 감바스 해산물", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "dassai-39": { name: "닷사이 39 준마이다이긴죠", price: 58900, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 닷사이 39 720ml", sourceUrl: "https://dailyshot.co/m/item/4972", note: "정미율 39% 야마다니시키로 빚은 화사한 과실 향과 부드러운 감칠맛.", pairing: "숙성 연어 사시미 & 광어회", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "dassai-45": { name: "닷사이 45 준마이다이긴죠", price: 39900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 닷사이 45 720ml", sourceUrl: "https://dailyshot.co/m/item/16787", note: "준마이다이긴죠 입문용으로 가장 인기가 높은 닷사이의 스테디셀러.", pairing: "모둠 생선회 사시미 & 새우 해산물 튀김", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "kubota-senju": { name: "쿠보타 센쥬 긴죠", price: 34500, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 쿠보타 센쥬 720ml", sourceUrl: "https://dailyshot.co/m/item/5311", note: "식중주로 설계되어 음식 본연의 맛을 살려주는 깔끔한 키레(끝맛).", pairing: "도미 흰살생선 소금구이 & 야키토리 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "kubota-hekiju": { name: "쿠보타 헤키쥬 준마이다이긴죠 야마하이", price: 64000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 쿠보타 헤키쥬 720ml", sourceUrl: "https://dailyshot.co/m/item/3284", note: "전통 야마하이 제법의 깊은 감칠맛과 다이긴죠의 깔끔함이 공존하는 사케.", pairing: "장어구이 & 소고기 타다키 스테이크", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "jozen-mizuno-gotoshi-junmai-ginjo": { name: "상선여수 준마이긴죠", price: 36900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 상선여수 준마이긴죠", sourceUrl: "https://dailyshot.co/m/item/3646", note: "물처럼 맑고 부드럽게 넘어가는 니가타현의 대표적인 이지드링킹 사케.", pairing: "광어 사시미 & 바지락 해산물 술찜", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "kamoizumi-shusen-sachi": { name: "카모이즈미 주센 사치 준마이긴죠", price: 48000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 카모이즈미 주센 사치", sourceUrl: "https://dailyshot.co/m/item/4307", note: "히로시마 명주. 풍부한 쌀의 감칠맛과 은은한 단맛이 일품 요리와 조화.", pairing: "참치 붉은살 사시미 & 간장 양념 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFS3dZ8SW" },
  "kikusui-karakuchi": { name: "키쿠스이 카라구치 혼죠조", price: 24900, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 키쿠스이 카라구치", sourceUrl: "https://dailyshot.co/m/item/13614", note: "드라이하고 깔끔한 맛으로 기름진 생선구이나 이자카야 안주에 최적.", pairing: "바삭한 고등어 생선구이 & 소금 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "tatenokawa-seiryu-junmai-daiginjo": { name: "타테노카와 세이류 준마이다이긴죠", price: 44900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 타테노카와 세이류", sourceUrl: "https://dailyshot.co/m/item/25791", note: "야마가타현의 청류처럼 투명하고 산뜻한 과실 아로마의 준마이다이긴죠.", pairing: "석화 생굴 플레이트 & 광어회 사시미", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "onigoroshi-pack": { name: "일본 정통 오니고로시 사케", price: 16900, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "오니고로시 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/17982", note: "도깨비도 쓰러뜨린다는 이름의 짜릿하고 드라이한 가성비 데일리 사케.", pairing: "노릇한 생선구이 & 모둠 야키토리 꼬치", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "ganbare-otousan": { name: "간바레 오토상", price: 18900, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "간바레 오토상 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/3348", note: "부드럽고 은은한 단맛으로 차갑게도 따뜻하게도 즐기기 좋은 국민 사케.", pairing: "간장 양념 닭꼬치 & 매콤 해산물 볶음", affiliateUrl: "https://link.coupang.com/a/hUFS3dZ8SW" },
  "hwayo-25": { name: "화요 25도 증류식 소주", price: 12900, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "화요 25도 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/16787", note: "우리 쌀 100%와 지하 암반수로 빚어 옹기 숙성한 깔끔한 프리미엄 증류주.", pairing: "숙성 광어회 사시미 & 해산물 나베", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "hwayo-41": { name: "화요 41도 프리미엄 증류식 소주", price: 23900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 화요 41도", sourceUrl: "https://dailyshot.co/m/item/3441", note: "묵직한 바디감과 깊은 쌀의 풍미로 온더락이나 하이볼로도 훌륭한 명주.", pairing: "한우 차돌박이 소고기 구이 & 육회", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "hwayo-xp": { name: "화요 X.Premium 오크 숙성", price: 62000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 화요 X.Premium", sourceUrl: "https://dailyshot.co/m/item/3441", note: "화요 41 원액을 오크통에서 장기 숙성해 한국적 싱글몰트의 풍미를 구현.", pairing: "소고기 갈비살 스테이크 & 스모크 훈제 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "ilpum-jinro-oak-43": { name: "일품진로 오크 43", price: 18500, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "일품진로 오크 43 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/16165", note: "12년 목통 숙성 원액을 블렌딩한 진한 오크 향의 고도수 증류식 소주.", pairing: "훈제 오리 스테이크 & 구운 아몬드 믹스넛", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "won-soju-classic": { name: "원소주 클래식 상압증류 28도", price: 21900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 원소주 클래식", sourceUrl: "https://dailyshot.co/m/item/23182", note: "강원도 원주 쌀을 상압증류해 누룩과 구수한 곡물 아로마가 진한 전통 소주.", pairing: "바비큐 삼겹살 & 소금구이 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "yeontae-goryangju-gold": { name: "연태고량주 골드 34도", price: 19800, checked: "2026-10-15", source: "이마트 트레이더스", sourceTitle: "연태고량주 골드 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/4220", note: "배·파인애플처럼 화사한 과일 향과 부드러운 목넘김의 중국 산동성 대표 고량주.", pairing: "양갈비 스테이크 꼬치 & 칠리 새우 해산물", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "shuijingfang-wellbay-52": { name: "수정방 웰베이 52도 백주", price: 139000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 수정방 웰베이 52도", sourceUrl: "https://dailyshot.co/m/item/6231", note: "600년 역사의 농향형 백주. 화려한 파인애플·자두 향과 깔끔한 피니시.", pairing: "북경오리 스테이크 & 전복 해산물 볶음", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "kaoliang-58-kinmen": { name: "금문고량주 58도", price: 38900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 금문고량주 58도", sourceUrl: "https://dailyshot.co/m/item/5426", note: "대만 진먼섬의 화강암 지하수로 빚은 맑고 강렬한 청향형 명주.", pairing: "동파육 바비큐 & 노릇한 생선구이", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "moutai-yingbin-53": { name: "귀주모태주 마오타이 영빈주 53도", price: 68000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 마오타이 영빈주", sourceUrl: "https://dailyshot.co/m/item/3441", note: "구이저우 마오타이의 정통 장향형 풍미를 합리적으로 경험하는 백주.", pairing: "양갈비 프렌치랙 & 소고기 스테이크", affiliateUrl: "https://link.coupang.com/a/hUGi2vPhcG" },
  "hendricks-gin": { name: "핸드릭스 진", price: 56900, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 핸드릭스 진", sourceUrl: "https://dailyshot.co/m/item/3270", note: "불가리아산 장미 꽃잎과 오이 에센스를 인퓨징한 스코틀랜드 크래프트 진.", pairing: "크림 치즈 카나페 크래커 & 그린 올리브", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "ballantines-17": { name: "발렌타인 17년 블렌디드 스카치", price: 119000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 발렌타인 17년", sourceUrl: "https://dailyshot.co/m/item/3218", note: "한국인이 가장 선호하는 부드러운 바닐라·꿀·오크 밸런스의 17년 블렌디드.", pairing: "바닐라 마카롱 디저트 & 구운 아몬드", affiliateUrl: "https://link.coupang.com/a/hUFAMBL2n6" },
  "ballantines-21": { name: "발렌타인 21년 블렌디드 스카치", price: 178000, checked: "2026-10-15", source: "신라면세점 (면세가)", sourceTitle: "신라면세점 발렌타인 21년", sourceUrl: "https://www.shilladfs.com/", note: "면세점 스테디셀러. 실키한 헤더 허니와 스파이시한 오크의 긴 여운.", pairing: "프리미엄 생초콜릿 & 구운 피칸 견과", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "johnnie-walker-black-12": { name: "조니워커 블랙 라벨 12년", price: 46900, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "조니워커 블랙 라벨 판매처", sourceUrl: "https://dailyshot.co/m/item/38261", note: "은은한 스모크와 건포도 단맛으로 니트·하이볼 모두 완벽한 스탠다드 스카치.", pairing: "새우 감바스 알 아히요 & 바게트 크래커", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "johnnie-walker-green-15": { name: "조니워커 그린 라벨 15년", price: 88000, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "조니워커 그린 라벨 판매처", sourceUrl: "https://dailyshot.co/m/item/4888", note: "탈리스커·링크우드·크래건모어·쿨일라 4대 싱글몰트만 블렌딩한 몰트 위스키.", pairing: "스모크 훈제 치즈 & 구운 아몬드 믹스넛", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "chivas-regal-18": { name: "시바스 리갈 18년 골드 시그니처", price: 108000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 시바스 리갈 18년", sourceUrl: "https://dailyshot.co/m/item/3190", note: "다크 초콜릿과 말린 과일 등 85가지 아로마 노트를 품은 프리미엄 블렌디드.", pairing: "카카오 다크 초콜릿 & 오렌지 타르트", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "woodford-reserve": { name: "우드포드 리저브 버번 위스키", price: 76000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 우드포드 리저브", sourceUrl: "https://dailyshot.co/m/item/20584", note: "켄터키 더비 공식 버번. 호밀 함량이 높아 스파이시하고 복합적인 오크 풍미.", pairing: "소고기 채끝 스테이크 & 구운 호두 견과", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "jameson-standard": { name: "제임슨 스탠다드 아이리시 위스키", price: 33900, checked: "2026-10-15", source: "GS25 와인25플러스", sourceTitle: "제임슨 스탠다드 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/2731", note: "3번 증류해 특유의 거친 맛 없이 부드럽고 고소한 전 세계 판매 1위 아이리시 위스키.", pairing: "숙성 체다 치즈 나초 & 바삭한 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "suntory-kakubin": { name: "산토리 가쿠빈 위스키", price: 38500, checked: "2026-10-15", source: "CU 바겟 (예약 픽업)", sourceTitle: "산토리 가쿠빈 판매처 페이지", sourceUrl: "https://dailyshot.co/m/item/2981", note: "거북이 등껍질 모양 보틀로 유명한 일본 이자카야 하이볼의 영원한 기준.", pairing: "바삭한 가라아게 & 소금 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "nikka-from-the-barrel": { name: "닛카 프롬 더 배럴", price: 89000, checked: "2026-10-15", source: "키햐", sourceTitle: "키햐 닛카 프롬 더 배럴", sourceUrl: "https://dailyshot.co/m/item/2330", note: "51.4도 고도수에 담긴 응축된 오크·스파이스·과실 풍미의 사각 보틀 명작.", pairing: "스모크 훈제 치즈 & 진한 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "highland-park-12": { name: "하이랜드 파크 12년 바이킹 아너", price: 84000, checked: "2026-10-15", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 하이랜드 파크 12년", sourceUrl: "https://dailyshot.co/m/item/3193", note: "오크니 제도의 헤더 피트 스모크와 셰리 오크 단맛이 절묘한 균형을 이루는 싱글몰트.", pairing: "한우 등심 스테이크 & 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "springbank-10": { name: "스프링뱅크 10년 캠벨타운 싱글몰트", price: 215000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 스프링뱅크 10년", sourceUrl: "https://dailyshot.co/m/item/4552", note: "캠벨타운의 전설. 전 공정 수작업으로 완성한 오일리하고 복합적인 몰트 풍미.", pairing: "스모크 훈제 치즈 & 숙성 고다 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "springbank-15": { name: "스프링뱅크 15년 캠벨타운 싱글몰트", price: 340000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 스프링뱅크 15년", sourceUrl: "https://dailyshot.co/m/item/4552", note: "100% 셰리 캐스크 숙성으로 깊고 진한 건포도·가죽·피트 스모크의 조화.", pairing: "카카오 85% 다크 초콜릿 & 이베리코 하몽", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "kilkerran-12": { name: "킬케란 12년 캠벨타운 싱글몰트", price: 159000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 킬케란 12년", sourceUrl: "https://dailyshot.co/m/item/3190", note: "글렌가일 증류소의 대표작. 은은한 피트와 시트러스·바닐라 오크의 우아한 밸런스.", pairing: "구운 아몬드 믹스넛 & 브리 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "hakushu-12": { name: "산토리 하쿠슈 12년 싱글몰트", price: 279000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 산토리 하쿠슈 12년", sourceUrl: "https://dailyshot.co/m/item/3271", note: "남알프스 숲속 증류소가 빚어낸 청량한 풋사과·민트 허브와 은은한 스모크.", pairing: "흰살생선 소금구이 & 구운 마카다미아", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "hibiki-21": { name: "산토리 히비키 21년 블렌디드", price: 980000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 산토리 히비키 21년", sourceUrl: "https://dailyshot.co/m/item/5544", note: "세계 위스키 어워즈 다관왕. 잘 익은 자두와 미즈나라 백단향의 압도적인 여운.", pairing: "한우 안심 스테이크 & 프리미엄 생초콜릿", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "chita-single-grain": { name: "산토리 치타 싱글 그레인 위스키", price: 79000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 산토리 치타", sourceUrl: "https://dailyshot.co/m/item/2981", note: "꿀과 아카시아 꽃향기가 부드럽게 퍼지는 일본 대표 싱글 그레인 위스키.", pairing: "연어 사시미 & 소금으로 간한 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "miyagikyo-single-malt": { name: "닛카 미야기쿄 싱글몰트", price: 139000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 닛카 미야기쿄", sourceUrl: "https://dailyshot.co/m/item/27815", note: "요이치와 대비되는 화사하고 우아한 과실 향과 셰리 캐스크의 부드러운 여운.", pairing: "생초콜릿 & 무화과 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "taketsuru-pure-malt": { name: "닛카 타케츠루 퓨어몰트", price: 145000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 닛카 타케츠루", sourceUrl: "https://dailyshot.co/m/item/22585", note: "일본 위스키의 아버지 타케츠루 마사타카의 이름을 헌정한 균형 잡힌 블렌디드 몰트.", pairing: "스모크 훈제 치즈 & 구운 피칸 견과", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "glenlivet-12": { name: "더 글렌리벳 12년 싱글몰트", price: 68000, checked: "2026-10-31", source: "CU 바겟 (예약 픽업)", sourceTitle: "데일리샷 더 글렌리벳 12년", sourceUrl: "https://dailyshot.co/m/item/2330", note: "스페이사이드 싱글몰트의 기준. 파인애플과 바닐라가 어우러진 화사한 아로마.", pairing: "구운 아몬드 & 과일 타르트 디저트", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "glenlivet-15-french-oak": { name: "더 글렌리벳 15년 프렌치 오크 리저브", price: 109000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌리벳 15년", sourceUrl: "https://dailyshot.co/m/item/3190", note: "프랑스 도르도뉴 리무쟁 오크 숙성으로 완성한 크리미한 버터·아몬드 스파이스.", pairing: "호두 타르트 & 숙성 체다 치즈", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "glenlivet-18": { name: "더 글렌리벳 18년 배치 리저브", price: 185000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌리벳 18년", sourceUrl: "https://dailyshot.co/m/item/3190", note: "퍼스트·세컨드필 아메리칸 오크와 셰리 오크가 빚어낸 농축된 오렌지·토피 풍미.", pairing: "카카오 다크 초콜릿 & 살구 디저트", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "glenfiddich-21-gran-reserva": { name: "글렌피딕 21년 그랑 레제르바", price: 329000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌피딕 21년", sourceUrl: "https://dailyshot.co/m/item/3165", note: "카리브해 럼 캐스크 피니시로 완성한 바나나·무화과·토피의 우아한 깊숙함.", pairing: "프리미엄 생초콜릿 & 무화과 하몽", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "glenmorangie-lasanta-12": { name: "글렌모렌지 라산타 12년 셰리 캐스크", price: 89000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌모렌지 라산타 12년", sourceUrl: "https://dailyshot.co/m/item/8196", note: "올로로소·PX 셰리 캐스크에서 추가 숙성해 건포도와 호두 풍미가 따뜻한 싱글몰트.", pairing: "다크 초콜릿 브라우니 & 구운 헤이즐넛", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "glenmorangie-quinta-ruban-14": { name: "글렌모렌지 퀸타 루반 14년 포트 캐스크", price: 105000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌모렌지 퀸타 루반 14년", sourceUrl: "https://dailyshot.co/m/item/8699", note: "루비 포트 와인 캐스크 피니시로 베리류 과실과 다크 초콜릿·민트 노트가 매혹적인 위스키.", pairing: "민트 다크 초콜릿 & 고르곤졸라 치즈", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "aberlour-abunadh": { name: "아벨라워 아부나흐 캐스크 스트렝스", price: 169000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 아벨라워 아부나흐", sourceUrl: "https://dailyshot.co/m/item/3239", note: "물 한 방울 섞지 않은 올로로소 셰리 캐스크 원액 그대로의 강렬한 셰리 폭탄.", pairing: "카카오 85% 다크 초콜릿 & 이베리코 하몽", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "glenallachie-15": { name: "글렌알라키 15년 싱글몰트", price: 159000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌알라키 15년", sourceUrl: "https://dailyshot.co/m/item/2532", note: "PX와 올로로소 셰리 판초 및 혹스헤드 숙성으로 완성한 진한 레이즌·모카 풍미.", pairing: "프리미엄 생초콜릿 & 구운 피칸 믹스넛", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "glendronach-12": { name: "글렌드로낙 12년 오리지널 셰리", price: 104000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌드로낙 12년", sourceUrl: "https://dailyshot.co/m/item/3200", note: "스페인 안달루시아산 PX·올로로소 셰리 캐스크로만 숙성한 정통 하이랜드 셰리 몰트.", pairing: "다크 초콜릿 & 무화과 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "glendronach-15-revival": { name: "글렌드로낙 15년 리바이벌", price: 175000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 글렌드로낙 15년", sourceUrl: "https://dailyshot.co/m/item/5202", note: "다크 체리와 에스프레소 마지팬 풍미가 묵직하게 이어지는 셰리 위스키의 교과서.", pairing: "이베리코 하몽 & 진한 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "tamnavulin-sherry-cask": { name: "탐나불린 더블 캐스크 셰리 에디션", price: 48000, checked: "2026-10-31", source: "이마트 트레이더스", sourceTitle: "데일리샷 탐나불린 셰리 캐스크", sourceUrl: "https://dailyshot.co/m/item/4463", note: "세 가지 서로 다른 올로로소 셰리 캐스크로 피니시한 가성비 최고의 데일리 싱글몰트.", pairing: "바삭한 크래커 & 체다 치즈 플레이트", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "auchentoshan-three-wood": { name: "오켄토션 쓰리우드 로우랜드 싱글몰트", price: 98000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 오켄토션 쓰리우드", sourceUrl: "https://dailyshot.co/m/item/3428", note: "3회 증류 로우랜드 원액을 버번·올로로소·PX 3가지 오크통에서 숙성한 부드러운 몰트.", pairing: "피칸 타르트 & 밀크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "oban-14": { name: "오반 14년 웨스트 하이랜드 싱글몰트", price: 142000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 오반 14년", sourceUrl: "https://dailyshot.co/m/item/3242", note: "하이랜드의 과실 향과 아일라의 짭조름한 바다 피트가 만나는 항구 마을 싱글몰트.", pairing: "석화 생굴 & 훈제 연어 카나페", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "singleton-dufftown-12": { name: "싱글톤 더프타운 12년 싱글몰트", price: 59000, checked: "2026-10-31", source: "GS25 와인25플러스", sourceTitle: "데일리샷 싱글톤 12년", sourceUrl: "https://dailyshot.co/m/item/3190", note: "처음 위스키를 접하는 사람도 반하게 만드는 구운 견과류와 달콤한 과실 밸런스.", pairing: "구운 아몬드 믹스넛 & 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "singleton-dufftown-15": { name: "싱글톤 더프타운 15년 싱글몰트", price: 95000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 싱글톤 15년", sourceUrl: "https://dailyshot.co/m/item/3190", note: "토피 애플과 벌집 꿀의 풍미가 실키하게 감싸는 스페이사이드 싱글몰트.", pairing: "사과 타르트 디저트 & 구운 호두", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "mortlach-16": { name: "모틀락 16년 더프타운의 야수", price: 189000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 모틀락 16년", sourceUrl: "https://dailyshot.co/m/item/3190", note: "독창적인 2.81회 증류 공법이 만들어낸 미티(Meaty)하고 묵직한 셰리 바디감.", pairing: "드라이에이징 소고기 스테이크 & 하몽", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "bunnahabhain-12": { name: "부나하벤 12년 아일라 싱글몰트", price: 108000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 부나하벤 12년", sourceUrl: "https://dailyshot.co/m/item/3154", note: "아일라 섬에서 보기 드문 논피트(Non-Peated) 스타일로 셰리·견과·바다 내음이 매력적.", pairing: "구운 호두 견과 & 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "caol-ila-12": { name: "쿨일라 12년 아일라 싱글몰트", price: 96000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 쿨일라 12년", sourceUrl: "https://dailyshot.co/m/item/4656", note: "깔끔하고 정교한 시트러스 피트 스모크와 올리브 오일처럼 매끄러운 텍스처.", pairing: "훈제 연어 사시미 & 석화 생굴", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "bruichladdich-classic-laddie": { name: "브룩라디 더 클래식 라디", price: 92000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 브룩라디 클래식 라디", sourceUrl: "https://dailyshot.co/m/item/3972", note: "100% 스코틀랜드 보리로 빚은 논피트 아일라 싱글몰트. 아쿠아 보틀만큼 청량한 몰트향.", pairing: "가리비 관자 버터구이 해산물 & 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "port-charlotte-10": { name: "포트 샬롯 10년 헤비 피티드", price: 115000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 포트 샬롯 10년", sourceUrl: "https://dailyshot.co/m/item/8622", note: "40PPM의 강렬한 바비큐 피트 연기와 프렌치 와인 캐스크의 우아한 바닐라가 공존.", pairing: "양갈비 스테이크 & 스모크 훈제 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "kavalan-classic": { name: "카발란 클래식 싱글몰트", price: 129000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 카발란 클래식", sourceUrl: "https://dailyshot.co/m/item/3260", note: "대만 카발란 증류소의 첫 작품. 망고·배·바닐라의 열대과일 아로마가 폭발하는 싱글몰트.", pairing: "망고 과일 타르트 & 구운 마카다미아", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "kavalan-solist-vinho-barrique": { name: "카발란 솔리스트 비노 바리끄 CS", price: 265000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 카발란 비노 바리끄", sourceUrl: "https://dailyshot.co/m/item/7869", note: "세계 최고의 싱글몰트 수상작. 와인 오크통을 리차징해 멜론·카라멜·다크초콜릿이 응축됨.", pairing: "한우 채끝 스테이크 & 카카오 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "kavalan-solist-port-cask": { name: "카발란 솔리스트 포트 캐스크 CS", price: 235000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 카발란 솔리스트 포트", sourceUrl: "https://dailyshot.co/m/item/5932", note: "포르투갈 포트 와인 캐스크가 선사하는 자두·블랙베리 잼과 풍부한 견과류 피니시.", pairing: "생초콜릿 & 무화과 프로슈토 하몽", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "johnnie-walker-gold-reserve": { name: "조니워커 골드 라벨 리저브", price: 76000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 조니워커 골드 리저브", sourceUrl: "https://dailyshot.co/m/item/24464", note: "클라이넬리쉬 원액을 중심으로 블렌딩해 헤더 허니와 바닐라가 화려하게 펼쳐지는 위스키.", pairing: "마카롱 디저트 & 브리 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFAMBL2n6" },
  "johnnie-walker-18": { name: "조니워커 18년 플래티넘 블렌드", price: 128000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 조니워커 18년", sourceUrl: "https://dailyshot.co/m/item/1745", note: "18년 이상 숙성된 최대 18가지 몰트·그레인 원액이 만드는 원숙하고 크리미한 스카치.", pairing: "다크 초콜릿 & 구운 아몬드 믹스넛", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "monkey-shoulder": { name: "몽키 숄더 블렌디드 몰트", price: 49900, checked: "2026-10-31", source: "CU 바겟 (예약 픽업)", sourceTitle: "데일리샷 몽키 숄더", sourceUrl: "https://dailyshot.co/m/item/3211", note: "스페이사이드 싱글몰트 원액만 100% 블렌딩해 바닐라와 오렌지 향이 매력적인 인기 몰트.", pairing: "오렌지 타르트 & 바삭한 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "naked-malt": { name: "네이키드 몰트 퍼스트필 올로로소 셰리", price: 52000, checked: "2026-10-31", source: "GS25 와인25플러스", sourceTitle: "데일리샷 네이키드 몰트", sourceUrl: "https://dailyshot.co/m/item/4294", note: "맥캘란·하이랜드파크·글렌로세스 몰트 원액을 퍼스트필 셰리 오크에 추가 숙성한 가성비 셰리.", pairing: "다크 초콜릿 브라우니 & 구운 피칸", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "jack-daniels-single-barrel": { name: "잭다니엘 싱글배럴 셀렉트", price: 82000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 잭다니엘 싱글배럴", sourceUrl: "https://dailyshot.co/m/item/4343", note: "숙성고 최상층 배럴에서 단일 배럴로 병입해 묵직한 토스티드 오크와 카라멜이 일품.", pairing: "훈제 바비큐 폭립 & 구운 호두 견과", affiliateUrl: "https://link.coupang.com/a/hUGi2vPhcG" },
  "jim-beam-white": { name: "짐빔 화이트 버번 위스키", price: 26900, checked: "2026-10-31", source: "CU 바겟 (예약 픽업)", sourceTitle: "데일리샷 짐빔 화이트", sourceUrl: "https://dailyshot.co/m/item/8156", note: "청량한 짐빔 하이볼로 가장 사랑받는 세계 판매 1위 켄터키 스트레이트 버번.", pairing: "바삭한 가라아게 & 감바스 새우", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "knob-creek-9": { name: "놉 크릭 9년 스몰배치 버번", price: 74000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 놉 크릭 9년", sourceUrl: "https://dailyshot.co/m/item/6740", note: "짐빔 마스터 디스틸러가 만든 풀바디 스몰배치 버번. 50도 도수와 깊은 메이플·오크 향.", pairing: "소고기 등심 스테이크 & 스모크 훈제 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "elijah-craig-small-batch": { name: "일라이저 크레이그 스몰배치 버번", price: 69000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 일라이저 크레이그", sourceUrl: "https://dailyshot.co/m/item/3384", note: "버번의 아버지 일라이저 크레이그의 이름을 딴 바닐라·넛멕·스모키 오크의 정석 버번.", pairing: "피칸 타르트 & 카카오 다크 초콜릿", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "bulleit-bourbon": { name: "불릿 버번 프론티어 위스키", price: 56000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 불릿 버번", sourceUrl: "https://dailyshot.co/m/item/3384", note: "높은 호밀(Rye) 함량으로 깔끔하고 스파이시한 피니시가 돋보이는 켄터키 버번.", pairing: "페퍼 살라미 플래터 & 체다 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "bushmills-black-bush": { name: "부쉬밀 블랙 부쉬 아이리시 위스키", price: 45000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 부쉬밀 블랙 부쉬", sourceUrl: "https://dailyshot.co/m/item/3227", note: "올로로소 셰리 캐스크 숙성 몰트 함량이 80%에 달해 풍부한 건과일과 부드러운 목넘김을 자랑.", pairing: "구운 아몬드 & 밀크 초콜릿 디저트", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "redbreast-15": { name: "레드브레스트 15년 싱글 팟 스틸", price: 159000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 레드브레스트 15년", sourceUrl: "https://dailyshot.co/m/item/5296", note: "논칠필터링 46도로 병입해 12년보다 한층 더 농밀하고 크리미한 베리·오크 스파이스.", pairing: "프리미엄 생초콜릿 & 구운 피칸 견과", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "montes-alpha-cabernet-sauvignon": { name: "몬테스 알파 카베르네 소비뇽", price: 32000, checked: "2026-10-31", source: "이마트 트레이더스", sourceTitle: "데일리샷 몬테스 알파 카베르네 소비뇽", sourceUrl: "https://dailyshot.co/m/item/4390", note: "칠레 프리미엄 와인의 신호탄. 블랙커런트와 시가 박스 다크 초콜릿의 탄탄한 밸런스.", pairing: "소고기 채끝 스테이크 & 숙성 체다 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "montes-alpha-m": { name: "몬테스 알파 엠 M", price: 159000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 몬테스 알파 M", sourceUrl: "https://dailyshot.co/m/item/13283", note: "칠레 아팔타 밸리 최상급 포도로 빚은 보르도 블렌드 스타일의 아이콘 레드 와인.", pairing: "한우 안심 스테이크 & 파르미지아노 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "almaviva-puente-alto": { name: "알마비바 푸엔테 알토 칠레", price: 275000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 알마비바", sourceUrl: "https://dailyshot.co/m/item/4390", note: "샤토 무통 로칠드와 콘차 이 토로의 합작으로 탄생한 칠레 그랑 크뤼급 명작.", pairing: "드라이에이징 티본 스테이크 & 트러플 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "concha-y-toro-don-melchor": { name: "돈 멜초 카베르네 소비뇽", price: 195000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 돈 멜초", sourceUrl: "https://dailyshot.co/m/item/24514", note: "푸엔테 알토 테루아의 정수를 보여주는 칠레 카베르네 소비뇽의 정점.", pairing: "양갈비 프렌치랙 스테이크 & 고다 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "escudo-rojo-reserva-cabernet": { name: "에스쿠도 로호 레제르바 카베르네 소비뇽", price: 24900, checked: "2026-10-31", source: "GS25 와인25플러스", sourceTitle: "데일리샷 에스쿠도 로호", sourceUrl: "https://dailyshot.co/m/item/4114", note: "바롱 필립 드 로칠드 가문의 양조 기술로 빚은 세련된 칠레 데일리 레드 와인.", pairing: "훈제 바비큐 폭립 & 살라미 크래커", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "catena-zapata-malbec": { name: "카테나 자파타 말벡 아르헨티나", price: 36000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 카테나 말벡", sourceUrl: "https://dailyshot.co/m/item/5839", note: "아르헨티나 멘도사 고산지대 말벡의 짙은 보랏빛 자두·제비꽃·모카 아로마.", pairing: "소고기 갈비살 스테이크 & 스모크 치즈", affiliateUrl: "https://link.coupang.com/a/hTUTVKfYB2" },
  "luigi-bosca-malbec": { name: "알라모스 말벡 아르헨티나", price: 33000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 루이지 보스카 말벡", sourceUrl: "https://dailyshot.co/m/search?q=%EB%A3%A8%EC%9D%B4%EC%A7%80%EB%B3%B4%EC%8A%A4%EC%B9%B4", note: "120년 전통 아르헨티나 명가 루이지 보스카의 벨벳처럼 부드러운 스테이크 와인.", pairing: "양갈비 스테이크 & 이베리코 하몽", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "decoy-cabernet-sauvignon": { name: "디코이 바이 덕혼 카베르네 소비뇽", price: 42000, checked: "2026-10-31", source: "이마트 트레이더스", sourceTitle: "데일리샷 디코이 카베르네 소비뇽", sourceUrl: "https://dailyshot.co/m/item/4114", note: "덕혼 와이너리가 선보이는 캘리포니아 프리미엄 데일리 와인의 베스트셀러.", pairing: "소고기 등심 스테이크 & 체다 치즈", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "decoy-merlot": { name: "디코이 바이 덕혼 멀롯", price: 42000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 디코이 멀롯", sourceUrl: "https://dailyshot.co/m/item/23350", note: "블랙체리와 자두의 풍부한 과실미와 부드러운 탄닌이 돋보이는 캘리포니아 멀롯.", pairing: "오리 가슴살 스테이크 & 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "robert-mondavi-napa-cabernet": { name: "로버트 몬다비 나파밸리 카베르네 소비뇽", price: 79000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 로버트 몬다비 나파밸리", sourceUrl: "https://dailyshot.co/m/item/23299", note: "나파밸리의 거장 로버트 몬다비가 정립한 클래식 캘리포니아 카베르네 소비뇽.", pairing: "한우 채끝 스테이크 & 고르곤졸라 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "stags-leap-artemis-cabernet": { name: "스택스 립 아르테미스 카베르네 소비뇽", price: 129000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 스택스 립 아르테미스", sourceUrl: "https://dailyshot.co/m/item/4114", note: "파리의 심판 1위 와이너리. 벨벳 장갑 속 무쇠 주먹이라 불리는 우아한 구조감.", pairing: "소고기 안심 스테이크 & 프로슈토 하몽", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "joseph-phelps-insignia": { name: "조셉 펠프스 인시그니아 나파밸리", price: 420000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 조셉 펠프스 인시그니아", sourceUrl: "https://dailyshot.co/m/item/5226", note: "미국 최초의 메리티지 보르도 블렌드 컬트 와인. 끝없는 복합미와 실키한 탄닌.", pairing: "드라이에이징 티본 스테이크 & 파르미지아노 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "shafer-one-point-five": { name: "쉐이퍼 원 포인트 파이브 카베르네 소비뇽", price: 165000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 쉐이퍼 원 포인트 파이브", sourceUrl: "https://dailyshot.co/m/item/4114", note: "나파밸리 스택스 립 디스트릭트 테루아의 응축된 검은 과실과 모카·허브 아로마.", pairing: "양갈비 프렌치랙 & 숙성 고다 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "pio-cesare-barolo": { name: "피오 체사레 바롤로 이탈리아", price: 115000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 피오 체사레 바롤로", sourceUrl: "https://dailyshot.co/m/item/12022", note: "와인의 왕이라 불리는 피에몬테 바롤로. 장미 꽃잎과 타르 체리의 중후한 기품.", pairing: "트러플 한우 스테이크 & 이베리코 하몽", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "frescobaldi-nipozzano-chianti": { name: "프레스코발디 니포자노 키안티 루피나", price: 35000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 프레스코발디 니포자노", sourceUrl: "https://dailyshot.co/m/item/9998", note: "700년 토스카나 명문 가문의 키안티 루피나 리제르바. 생생한 산미와 체리·허브 풍미.", pairing: "살라미 프로슈토 플래터 & 파르미지아노 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "marques-de-riscal-reserva": { name: "마르께스 데 리스칼 리오하 레제르바", price: 39000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 마르께스 데 리스칼", sourceUrl: "https://dailyshot.co/m/item/20031", note: "황금 그물망 보틀로 유명한 스페인 리오하의 아이콘. 바닐라 오크와 숙성 베리의 조화.", pairing: "이베리코 하몽 & 양갈비 스테이크", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "two-hands-angels-share-shiraz": { name: "투 핸즈 엔젤스 쉐어 쉬라즈", price: 45000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 투 핸즈 엔젤스 쉐어", sourceUrl: "https://dailyshot.co/m/item/5020", note: "호주 맥라렌 베일 쉬라즈의 진하고 과즙미 넘치는 블루베리·다크초콜릿 풍미.", pairing: "훈제 바비큐 폭립 & 고르곤졸라 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "penfolds-koonunga-hill-shiraz-cabernet": { name: "펜폴즈 쿠능가 힐 쉬라즈 카베르네", price: 24000, checked: "2026-10-31", source: "CU 바겟 (예약 픽업)", sourceTitle: "데일리샷 펜폴즈 쿠능가 힐", sourceUrl: "https://dailyshot.co/m/item/15061", note: "호주 국보 와이너리 펜폴즈의 스타일을 합리적으로 즐기는 데일리 레드 블렌드.", pairing: "소고기 스테이크 & 페퍼 살라미", affiliateUrl: "https://link.coupang.com/a/hUGdOYKy5s" },
  "duckhorn-napa-sauvignon-blanc": { name: "덕혼 나파밸리 소비뇽 블랑", price: 52000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 덕혼 소비뇽 블랑", sourceUrl: "https://dailyshot.co/m/item/4102", note: "세미용을 소량 블렌딩하고 프렌치 오크 터치를 더해 실키하고 복합적인 나파 소비뇽 블랑.", pairing: "가리비 관자 해산물 구이 & 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "matua-marlborough-sauvignon-blanc": { name: "마투아 말보로 소비뇽 블랑", price: 21900, checked: "2026-10-31", source: "GS25 와인25플러스", sourceTitle: "데일리샷 마투아 소비뇽 블랑", sourceUrl: "https://dailyshot.co/m/item/18397", note: "뉴질랜드 최초의 소비뇽 블랑 생산자. 온도 변화 라벨로 마시기 가장 좋은 온도를 알려줌.", pairing: "새우 감바스 알 아히요 & 석화 생굴", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "villa-maria-private-bin-sauvignon": { name: "빌라 마리아 프라이빗 빈 소비뇽 블랑", price: 24000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 빌라 마리아 소비뇽 블랑", sourceUrl: "https://dailyshot.co/m/item/10711", note: "뉴질랜드 최다 수상 와이너리. 라임과 패션프루트 허브 향이 생생하게 살아있는 화이트.", pairing: "광어회 사시미 & 레몬 해산물 샐러드", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "santa-margherita-pinot-grigio": { name: "산타 마게리타 피노 그리지오", price: 38000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 산타 마게리타 피노 그리지오", sourceUrl: "https://dailyshot.co/m/item/3755", note: "이탈리아 알토 아디제 피노 그리지오의 기준. 풋사과와 복숭아의 깔끔하고 드라이한 미감.", pairing: "흰살생선 소금구이 & 올리브 치즈 카나페", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "louis-jadot-chablis": { name: "루이 자도 샤블리 부르고뉴", price: 49000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 루이 자도 샤블리", sourceUrl: "https://dailyshot.co/m/item/17247", note: "오크 숙성을 배제해 샤르도네 본연의 서늘한 미네랄과 레몬 산미를 살린 클래식 샤블리.", pairing: "석화 생굴 하프쉘 & 광어 사시미", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "dr-loosen-riesling": { name: "닥터 루젠 리슬링 독일 모젤", price: 25000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 닥터 루젠 리슬링", sourceUrl: "https://dailyshot.co/m/item/10893", note: "모젤 강의 점판암 토양이 빚어낸 백도·청사과 당도와 짜릿한 산미의 황금 밸런스.", pairing: "매콤 칠리 새우 해산물 & 과일 타르트", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "kung-fu-girl-riesling": { name: "쿵푸걸 리슬링 워싱턴", price: 26000, checked: "2026-10-31", source: "CU 바겟 (예약 픽업)", sourceTitle: "데일리샷 쿵푸걸 리슬링", sourceUrl: "https://dailyshot.co/m/item/5624", note: "아시안 푸드와 완벽한 궁합을 위해 탄생한 오프드라이 스타일의 화사한 리슬링.", pairing: "양념 닭꼬치 & 매콤 해산물 볶음", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "vietti-moscato-dasti": { name: "비에티 모스카토 다스티 카시나 네이라", price: 33000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 비에티 모스카토 다스티", sourceUrl: "https://dailyshot.co/m/item/11704", note: "3대 모스카토 다스티 중 하나. 잘 익은 살구와 장미 꽃잎 향이 기분 좋게 퍼지는 스위트 와인.", pairing: "마카롱 디저트 & 과일 브리 치즈", affiliateUrl: "https://link.coupang.com/a/hUFAMBL2n6" },
  "saracco-moscato-dasti": { name: "사라코 모스카토 다스티", price: 29000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 사라코 모스카토 다스티", sourceUrl: "https://dailyshot.co/m/item/11704", note: "모스카토의 마에스트로 파올로 사라코가 빚어낸 청포도 착즙 같은 생동감과 청량한 기포.", pairing: "생초콜릿 타르트 & 제철 과일 디저트", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "piper-heidsieck-cuvee-brut": { name: "파이퍼 하이직 뀌베 브뤼 샴페인", price: 65000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 파이퍼 하이직 브뤼", sourceUrl: "https://dailyshot.co/m/item/4741", note: "마릴린 먼로가 사랑한 레드 라벨 샴페인. 칸 영화제 공식 샴페인으로 경쾌한 산미가 일품.", pairing: "하몽 카나페 & 파르미지아노 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "taittinger-reserve-brut": { name: "떼땅져 리저브 브뤼 샴페인", price: 74000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 떼땅져 리저브 브뤼", sourceUrl: "https://dailyshot.co/m/item/4107", note: "샤르도네 비중이 40%로 높아 섬세한 흰 꽃향기와 브리오슈 피니시가 우아한 샴페인.", pairing: "훈제 연어 사시미 & 브리 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "bollinger-special-cuvee": { name: "볼랑져 스페셜 뀌베 브뤼 샴페인", price: 115000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 볼랑져 스페셜 뀌베", sourceUrl: "https://dailyshot.co/m/item/5012", note: "007 제임스 본드의 샴페인. 오크 배럴 발효가 주는 구운 사과와 호두의 묵직한 풍미.", pairing: "이베리코 하몽 & 구운 가리비 관자 해산물", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "laurent-perrier-la-cuvee": { name: "로랑 페리에 라 뀌베 브뤼 샴페인", price: 78000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 로랑 페리에 라 뀌베", sourceUrl: "https://dailyshot.co/m/item/4118", note: "가장 순수한 첫 번째 압착 포도즙(La Cuvee)만 사용해 시트러스와 백도 향이 맑은 샴페인.", pairing: "석화 생굴 플레이트 & 광어회 사시미", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "krug-grande-cuvee": { name: "크룩 그랑 뀌베 샴페인", price: 389000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 크룩 그랑 뀌베", sourceUrl: "https://dailyshot.co/m/item/4742", note: "10개 이상의 빈티지 원액 120여 종을 블렌딩해 교향곡 같은 복합미를 선사하는 샴페인의 제왕.", pairing: "석화 생굴 & 트러플 파르미지아노 치즈", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "kubota-senjyu-junmai": { name: "쿠보타 센쥬 준마이긴죠", price: 42000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 쿠보타 센쥬 준마이긴죠", sourceUrl: "https://dailyshot.co/m/item/5311", note: "기존 센쥬에 쌀 본연의 부드러운 감칠맛을 더한 깔끔하고 세련된 준마이긴죠.", pairing: "흰살생선 사시미 & 소금 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "hakkaisan-tokubetsu-honjozo": { name: "핫카이산 토쿠베츠 혼죠조", price: 34000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 핫카이산 토쿠베츠 혼죠조", sourceUrl: "https://dailyshot.co/m/item/7515", note: "차갑게 마셔도 데워 마셔도 흔들림 없는 깔끔한 목넘김의 니가타 탄레이 카라구치 명주.", pairing: "노릇한 생선구이 & 모둠 해산물 오뎅", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "koshino-kanbai-sai": { name: "코시노칸바이 사이 준마이긴죠", price: 46000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 코시노칸바이 사이", sourceUrl: "https://dailyshot.co/m/item/3292", note: "환상의 명주 코시노칸바이가 선보이는 은은한 긴죠향과 부드러운 감칠맛의 모던 사케.", pairing: "광어회 사시미 & 새우 해산물 튀김", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "shimeharitsuru-jun": { name: "시메하리츠루 준 준마이긴죠", price: 52000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 시메하리츠루 준", sourceUrl: "https://dailyshot.co/m/item/20031", note: "우아한 쌀의 단맛과 면도날처럼 깔끔하게 끊어지는 뒷맛으로 일식 셰프들이 극찬하는 사케.", pairing: "도미 사시미 & 흰살생선 소금구이", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "zaku-ho-no-tomo": { name: "자쿠 호노토모 준마이", price: 49000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 자쿠 호노토모", sourceUrl: "https://dailyshot.co/m/item/16282", note: "이세시마 정상회담 건배주 양조장. 화이트 와인처럼 산뜻한 산미와 배·청사과 아로마.", pairing: "연어 사시미 & 브리 치즈 카나페", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "nabeshima-junmai-ginjo": { name: "나베시마 준마이긴죠 오마치", price: 68000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 나베시마 준마이긴죠", sourceUrl: "https://dailyshot.co/m/item/19033", note: "IWC 챔피언 사케 수상 양조장. 쥬시한 과즙감과 미세한 탄산감이 살아있는 규슈 명주.", pairing: "참치 사시미 & 간장 양념 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFS3dZ8SW" },
  "sharaku-junmai-ginjo": { name: "샤라쿠 준마이긴죠", price: 69000, checked: "2026-10-31", source: "키햐", sourceTitle: "데일리샷 샤라쿠 준마이긴죠", sourceUrl: "https://dailyshot.co/m/item/29403", note: "멜론과 복숭아의 감미로운 향기와 입안을 감싸는 감칠맛이 일품인 후쿠시마 프리미엄 사케.", pairing: "숙성 광어회 & 가리비 관자 해산물 구이", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "phoenix-bihou-junmai-daiginjo": { name: "호오비덴 준마이다이긴죠", price: 59000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 호오비덴 준마이다이긴죠", sourceUrl: "https://dailyshot.co/m/item/30203", note: "마치 잘 익은 머스캣과 백도를 베어 문 듯 화사하고 향긋한 아로마의 인기 사케.", pairing: "석화 생굴 & 흰살생선 사시미", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "senshin-junmai-daiginjo": { name: "하쿠츠루 마루 준마이 사케", price: 129000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 센신 준마이다이긴죠", sourceUrl: "https://dailyshot.co/m/search?q=%EC%84%BC%EC%8B%A0", note: "아사히주조가 빚는 또 하나의 최고봉. 정미율 28%의 투명하고 기품 있는 목넘김.", pairing: "광어 사시미 & 도미 흰살생선 소금구이", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "gekkeikan-junmai": { name: "월계관 준마이 750", price: 15900, checked: "2026-10-31", source: "GS25 와인25플러스", sourceTitle: "데일리샷 월계관 준마이", sourceUrl: "https://dailyshot.co/m/item/3337", note: "부담 없는 가격에 구수한 쌀 풍미를 편하게 즐길 수 있는 홈술 베스트셀러 사케.", pairing: "바삭한 생선구이 & 모둠 야키토리 꼬치", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "hennessy-vsop": { name: "헤네시 V.S.O.P 프ivilège 꼬냑", price: 98000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 헤네시 VSOP", sourceUrl: "https://dailyshot.co/m/item/18123", note: "전 세계 VSOP 꼬냑의 기준. 구운 아몬드와 바닐라 정향 스파이스가 부드럽게 조화됨.", pairing: "카카오 다크 초콜릿 & 구운 피칸 견과", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "hennessy-xo": { name: "헤네시 X.O 꼬냑", price: 339000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 헤네시 XO", sourceUrl: "https://dailyshot.co/m/item/18123", note: "1870년 세계 최초로 X.O 등급을 탄생시킨 오리지널 꼬냑. 최대 30년 숙성 오드비 블렌딩.", pairing: "프리미엄 생초콜릿 & 이베리코 하몽", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
  "remy-martin-vsop": { name: "레미 마르탱 V.S.O.P 꼬냑", price: 89000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 레미 마르탱 VSOP", sourceUrl: "https://dailyshot.co/m/item/5025", note: "그랑 샴페인과 쁘띠 샴페인 포도로만 빚는 파인 샴페인 꼬냑의 우아한 바이올렛·바닐라 향.", pairing: "살구 타르트 디저트 & 구운 아몬드", affiliateUrl: "https://link.coupang.com/a/hUFgrOAffM" },
  "camus-xo": { name: "까뮤 X.O 꼬냑", price: 269000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 까뮤 XO", sourceUrl: "https://dailyshot.co/m/item/5012", note: "보르더리 지역 오드비가 선사하는 화려한 꽃향기와 말린 무화과·아몬드의 실키한 피니시.", pairing: "다크 초콜릿 브라우니 & 구운 헤이즐넛", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "patron-silver-tequila": { name: "패트론 실버 프리미엄 데킬라", price: 84000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 패트론 실버", sourceUrl: "https://dailyshot.co/m/item/4184", note: "블루 웨버 아가베 100%로 빚은 울트라 프리미엄 화이트 데킬라. 깔끔한 시트러스·백후추 노트.", pairing: "새우 감바스 해산물 & 라임 올리브 카나페", affiliateUrl: "https://link.coupang.com/a/hUF80Vp0lo" },
  "don-julio-blanco": { name: "돈 훌리오 블랑코 데킬라", price: 82000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 돈 훌리오 블랑코", sourceUrl: "https://dailyshot.co/m/item/4114", note: "멕시코 하이랜드 최상급 아가베의 싱그러운 라임·자몽 향과 깨끗한 목넘김.", pairing: "광어 세비체 사시미 & 새우 타코 해산물", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "don-julio-1942": { name: "돈 훌리오 1942 아네호 데킬라", price: 279000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 돈 훌리오 1942", sourceUrl: "https://dailyshot.co/m/item/20031", note: "최소 2년 반 이상 아메리칸 오크에서 숙성해 바닐라·구운 아가베·초콜릿 풍미가 극대화된 명작.", pairing: "카카오 다크 초콜릿 & 한우 채끝 스테이크", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "jose-cuervo-especial": { name: "호세 쿠에르보 에스페샬 레포사도", price: 29900, checked: "2026-10-31", source: "CU 바겟 (예약 픽업)", sourceTitle: "데일리샷 호세 쿠에르보", sourceUrl: "https://dailyshot.co/m/item/7916", note: "오크 배럴 숙성으로 황금빛을 띠며 마가리타나 데킬라 하이볼로 가장 대중적인 데킬라.", pairing: "체다 치즈 나초 크래커 & 매콤 새우", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "tanqueray-no-ten": { name: "탱커레이 넘버 텐 프리미엄 진", price: 54000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 탱커레이 넘버 텐", sourceUrl: "https://dailyshot.co/m/item/20031", note: "신선한 생자몽·오렌지·라임과 캐모마일을 증류해 마티니와 진토닉의 정점으로 꼽히는 진.", pairing: "훈제 연어 카나페 & 그린 올리브", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "bombay-sapphire-gin": { name: "봄베이 사파이어 런던 드라이 진", price: 34000, checked: "2026-10-31", source: "GS25 와인25플러스", sourceTitle: "데일리샷 봄베이 사파이어", sourceUrl: "https://dailyshot.co/m/item/2982", note: "10가지 보태니컬을 증기 인퓨전 방식으로 추출해 깔끔하고 향긋한 블루 보틀 런던 드라이 진.", pairing: "레몬 크림 치즈 크래커 & 올리브", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "roku-japanese-craft-gin": { name: "산토리 로쿠 진 재패니즈 크래프트", price: 49000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 산토리 로쿠 진", sourceUrl: "https://dailyshot.co/m/item/29510", note: "벚꽃·유자·산초·교쿠로 녹차 등 일본 사계절 6가지 보태니컬을 담은 육각 보틀 크래프트 진.", pairing: "광어회 사시미 & 소금 닭꼬치", affiliateUrl: "https://link.coupang.com/a/hUFNpIoJj2" },
  "monkey-47-gin": { name: "몽키 47 슈바르츠발트 드라이 진", price: 82000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 몽키 47 진", sourceUrl: "https://dailyshot.co/m/item/3211", note: "독일 블랙포레스트의 47가지 식물 재료를 47도 도수로 담아낸 세계 최고 수준의 프리미엄 진.", pairing: "이베리코 하몽 & 브리 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUFuvgA8Bw" },
  "grey-goose-vodka": { name: "그레이 구스 프랑스 프리미엄 보드카", price: 59000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 그레이 구스 보드카", sourceUrl: "https://dailyshot.co/m/item/4274", note: "프랑스 피카르디 최고급 겨울 밀과 샹파뉴 석회암 용천수로 빚은 실키한 프리미엄 보드카.", pairing: "석화 생굴 & 훈제 연어 카나페", affiliateUrl: "https://link.coupang.com/a/hTVhqm8JIz" },
  "belvedere-vodka": { name: "벨베디어 폴란드 호밀 보드카", price: 62000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 벨베디어 보드카", sourceUrl: "https://dailyshot.co/m/item/3203", note: "폴란드 단코프스키 호밀과 정제수만으로 4회 증류해 은은한 바닐라와 화이트페퍼 여운이 남음.", pairing: "연어 사시미 & 크림 치즈 크래커", affiliateUrl: "https://link.coupang.com/a/hUF3KgwtEa" },
  "ron-zacapa-23": { name: "론 자카파 23 센테나리오 럼", price: 95000, checked: "2026-10-31", source: "데일리샷 (픽업)", sourceTitle: "데일리샷 론 자카파 23", sourceUrl: "https://dailyshot.co/m/item/16787", note: "해발 2300m 구름 위의 집에서 솔레라 시스템으로 숙성한 과테말라 최고급 다크 럼.", pairing: "다크 초콜릿 브라우니 & 구운 피칸 견과", affiliateUrl: "https://link.coupang.com/a/hUFEKbU8CO" },
  "baileys-original-irish-cream": { name: "베일리스 오리지널 아이리시 크림", price: 28900, checked: "2026-10-31", source: "CU 바겟 (예약 픽업)", sourceTitle: "데일리샷 베일리스 오리지널", sourceUrl: "https://dailyshot.co/m/item/3342", note: "신선한 아일랜드 우유 크림과 아이리시 위스키 카카오 바닐라가 만난 달콤한 홈바 필수 리큐르.", pairing: "마카롱 디저트 & 생초콜릿 브라우니", affiliateUrl: "https://link.coupang.com/a/hUFIxrHbpY" },
};

function doPost(e) {
  let lock;
  try {
    const payload = parsePayload_(e);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error("Bind this script to the destination spreadsheet.");

    lock = LockService.getScriptLock();
    lock.waitLock(10000);

    // Phase 3: 유저 페어링 리뷰(UGC) 등록 분기 처리
    if (String(payload.action || "").trim() === "submit_review") {
      return handleSubmitReview_(spreadsheet, payload);
    }

    const email = String(payload.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonOutput_({ ok: false, error: "invalid_email" });
    }

    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
    ensureHeaderRow_(sheet);

    // 수집·동의 시각은 Apps Script 수신 시각으로 기록합니다. 클라이언트 시각은 참고로만 받습니다.
    // My List 통합 알림 시 쉼표로 연결된 다중 상품 ID/이름이 잘리지 않도록 여유 있게 허용합니다.
    const receivedAt = new Date();
    const marketingConsent = parseConsent_(payload.marketing_consent);
    sheet.appendRow([
      receivedAt,
      email,
      String(payload.product_id || "all").slice(0, 800),
      String(payload.product_name || "전체 입고 알림").slice(0, 1500),
      String(payload.source || "booze-base").slice(0, 100),
      marketingConsent,
      marketingConsent ? receivedAt : "",
      "",
    ]);
    return jsonOutput_({ ok: true });
  } catch (error) {
    console.error("Submission failed: " + error.message);
    return jsonOutput_({ ok: false, error: "submission_failed" });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function handleSubmitReview_(spreadsheet, payload) {
  const productId = sanitizeText_(payload.product_id || "", 120);
  const productName = sanitizeText_(payload.product_name || "", 160);
  const category = sanitizeText_(payload.category || "other", 40);
  const nickname = sanitizeText_(payload.nickname || "익명 애호가", 24);
  const pairingSnack = sanitizeText_(payload.pairing_snack || "", 80);
  const comment = sanitizeText_(payload.comment || "", 300);
  const ratingNum = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));

  if (!productId || !pairingSnack || !comment) {
    return jsonOutput_({ ok: false, error: "missing_review_fields" });
  }

  let reviewSheet = spreadsheet.getSheetByName(REVIEWS_SHEET_NAME);
  if (!reviewSheet) reviewSheet = spreadsheet.insertSheet(REVIEWS_SHEET_NAME);
  ensureCustomHeaderRow_(reviewSheet, REVIEW_HEADERS);

  reviewSheet.appendRow([
    new Date(),
    productId,
    productName,
    category,
    nickname,
    ratingNum,
    pairingSnack,
    comment,
    "approved",
  ]);
  return jsonOutput_({ ok: true, action: "submit_review" });
}

function doGet(e) {
  try {
    const action = e && e.parameter ? String(e.parameter.action || "").trim() : "";
    if (action === "reviews") {
      return jsonOutput_({ ok: true, reviews: getApprovedReviews_() });
    }
    return jsonOutput_({ ok: true, service: "liquor-tracker-waitlist" });
  } catch (error) {
    console.error("doGet failed: " + error.message);
    return jsonOutput_({ ok: false, error: "get_failed", reviews: [] });
  }
}

function getApprovedReviews_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) return [];
  const sheet = spreadsheet.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (v) { return String(v || "").trim(); });
  const col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const list = [];
  for (let i = rows.length - 1; i >= 0 && list.length < 100; i -= 1) {
    const r = rows[i];
    const status = String(r[col.status] || "approved").trim().toLowerCase();
    if (status !== "approved") continue;
    const submittedAt = r[col.submitted_at] instanceof Date
      ? Utilities.formatDate(r[col.submitted_at], SEND_TIMEZONE, "yyyy-MM-dd")
      : String(r[col.submitted_at] || "").slice(0, 10);
    list.push({
      submitted_at: submittedAt,
      product_id: String(r[col.product_id] || "").trim(),
      product_name: String(r[col.product_name] || "").trim(),
      category: String(r[col.category] || "other").trim(),
      nickname: String(r[col.nickname] || "익명 애호가").trim(),
      rating: Math.min(5, Math.max(1, Math.round(Number(r[col.rating]) || 5))),
      pairing_snack: String(r[col.pairing_snack] || "").trim(),
      comment: String(r[col.comment] || "").trim(),
    });
  }
  return list;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🍷 Booze Base 알림 발송")
    .addItem("선택한 행에 입고 알림 메일 발송", "sendSelectedWaitlistEmails")
    .addItem("미발송 신청자 전체에게 알림 메일 발송", "sendAllUnsentWaitlistEmails")
    .addToUi();
}

function sendSelectedWaitlistEmails() {
  const ui = SpreadsheetApp.getUi();
  if (!guardSendTime_(ui)) return;
  if (!guardAlcoholAdAuthorization_(ui)) return;
  const sheet = getWaitlistSheet_();
  const range = sheet.getActiveRange();
  if (!range || range.getLastRow() < 2) {
    ui.alert("발송할 신청 행을 선택해 주세요. 헤더 행은 발송 대상이 아닙니다.");
    return;
  }
  const firstRow = Math.max(2, range.getRow());
  const lastRow = range.getLastRow();
  const selectedRows = [];
  for (let row = firstRow; row <= lastRow; row += 1) selectedRows.push(row);
  const candidates = findEligibleRows_(sheet, selectedRows);
  if (!candidates.length) {
    ui.alert("선택 범위에 현재 유효한 광고성 정보 수신 동의가 있고 아직 발송되지 않은 행이 없습니다.");
    return;
  }
  if (!confirmBeforeSend_(ui, candidates.length, "선택 행")) return;
  sendRows_(sheet, candidates, ui);
}

function sendAllUnsentWaitlistEmails() {
  const ui = SpreadsheetApp.getUi();
  if (!guardSendTime_(ui)) return;
  if (!guardAlcoholAdAuthorization_(ui)) return;
  const sheet = getWaitlistSheet_();
  const candidates = findEligibleRows_(sheet, null);
  if (!candidates.length) {
    ui.alert("현재 유효한 광고성 정보 수신 동의가 있고 아직 발송되지 않은 신청자가 없습니다. 기존 동의 미기록 행은 대상에서 제외됩니다.");
    return;
  }
  if (!confirmBeforeSend_(ui, candidates.length, "미발송 신청자 전체")) return;
  sendRows_(sheet, candidates, ui);
}

function guardSendTime_(ui) {
  const hour = Number(Utilities.formatDate(new Date(), SEND_TIMEZONE, "HH"));
  if (hour < 8 || hour >= 21) {
    ui.alert("야간 발송 제한", "한국 시간 21:00~08:00에는 광고성 이메일을 보낼 수 없습니다. 지금은 발송이 차단되었습니다.", ui.ButtonSet.OK);
    return false;
  }
  return true;
}

function guardAlcoholAdAuthorization_(ui) {
  if (ALCOHOL_AD_EMAILS_AUTHORIZED) return true;
  ui.alert(
    "법률 검토 전 발송 차단",
    "국민건강증진법 제8조의2는 주류 면허 보유자·수입자 외의 주류광고를 제한합니다. 이 이메일은 상품명·가격·판매처 링크를 포함하므로 광고로 판단될 가능성을 배제할 수 없습니다. 해당 콘텐츠 발송이 허용된다는 서면 법률 검토를 받기 전에는 발송하지 않습니다. 검토 후에도 발송 권한이 확인된 경우에만 Code.gs 상단 ALCOHOL_AD_EMAILS_AUTHORIZED 설정을 변경하세요.",
    ui.ButtonSet.OK
  );
  return false;
}

function confirmBeforeSend_(ui, count, label) {
  const response = ui.alert(
    "발송 전 확인",
    label + "에서 현재 동의가 유효한 " + count + "건을 (광고) 이메일로 발송합니다. 판매처의 입고 여부·표시가를 확인하고 Code.gs의 가격 스냅샷도 최신으로 갱신했습니까?",
    ui.ButtonSet.YES_NO
  );
  return response === ui.Button.YES;
}

function findEligibleRows_(sheet, selectedRows) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || "").trim(); });
  const column = {};
  headers.forEach(function (header, index) { column[header] = index; });
  const required = ["email", "product_id", "product_name", "marketing_consent", "marketing_consent_at", "notified_at"];
  if (required.some(function (name) { return column[name] === undefined; })) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const selected = selectedRows ? new Set(selectedRows) : null;
  const now = new Date();
  const result = [];
  rows.forEach(function (values, index) {
    const rowNumber = index + 2;
    if (selected && !selected.has(rowNumber)) return;
    const email = String(values[column.email] || "").trim().toLowerCase();
    const productId = String(values[column.product_id] || "all").trim();
    const consent = values[column.marketing_consent];
    const consentAt = values[column.marketing_consent_at];
    const notifiedAt = values[column.notified_at];
    if (consent !== true || notifiedAt || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (!isConsentCurrent_(consentAt, now)) return;
    if (!resolveProducts_(productId).length) return;
    result.push({ rowNumber: rowNumber, email: email, productId: productId, productName: String(values[column.product_name] || "").trim() });
  });
  return result;
}

function isConsentCurrent_(value, now) {
  const consentAt = value instanceof Date ? value : new Date(value);
  if (isNaN(consentAt.getTime()) || consentAt.getTime() > now.getTime()) return false;
  const expiresAt = new Date(consentAt.getTime());
  expiresAt.setFullYear(expiresAt.getFullYear() + 2);
  return now.getTime() < expiresAt.getTime();
}

function sendRows_(sheet, candidates, ui) {
  let contact;
  try {
    contact = getOperatorContact_();
  } catch (error) {
    ui.alert("발송 중단", error.message, ui.ButtonSet.OK);
    return;
  }
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  try {
    lock.waitLock(10000);
    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || "").trim(); });
    const column = {};
    headers.forEach(function (header, index) { column[header] = index + 1; });
    candidates.forEach(function (record) {
      const current = sheet.getRange(record.rowNumber, 1, 1, lastColumn).getValues()[0];
      if (current[column.marketing_consent - 1] !== true || current[column.notified_at - 1]) {
        skipped += 1;
        return;
      }
      const now = new Date();
      if (!isConsentCurrent_(current[column.marketing_consent_at - 1], now)) {
        skipped += 1;
        return;
      }
      const campaign = buildEmail_(record, contact);
      if (!campaign) {
        skipped += 1;
        return;
      }
      try {
        GmailApp.sendEmail(record.email, campaign.subject, campaign.textBody, {
          htmlBody: campaign.htmlBody,
          name: "Booze Base",
          replyTo: contact,
        });
        sheet.getRange(record.rowNumber, column.notified_at).setValue(new Date());
        sent += 1;
      } catch (error) {
        console.error("Email send failed on row " + record.rowNumber + ": " + error.message);
        failed += 1;
      }
    });
  } catch (error) {
    console.error("Waitlist send process failed: " + error.message);
    ui.alert("발송 오류", "발송 도중 오류가 발생했습니다. notified_at이 비어 있는 행만 재확인 후 다시 시도하세요.", ui.ButtonSet.OK);
    return;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
  ui.alert("발송 결과", "발송 " + sent + "건 · 제외 " + skipped + "건 · 실패 " + failed + "건\n성공 행에는 notified_at이 기록되었습니다.", ui.ButtonSet.OK);
}

function buildEmail_(record, contact) {
  const products = resolveProducts_(record.productId);
  if (!products.length) return null;
  const rawId = String(record.productId || "all").trim();
  const isAll = rawId === "all";
  const isMulti = !isAll && products.length > 1;
  const topic = isAll
    ? "전체 입고 알림 신청 목록"
    : isMulti
      ? "내가 찜한 주류 (" + products.length + "종) 최신 가격·페어링 소식"
      : products[0].name;
  const subject = isMulti
    ? "(광고) [Booze Base] 내가 찜한 주류 " + products.length + "종의 최신 가격·페어링 소식!"
    : "(광고) [Booze Base] " + topic + " 가격·페어링 참고 정보";
  const productBlocks = products.map(buildProductBlock_).join("");
  const unsubscribeUrl = "mailto:" + contact + "?subject=" + encodeURIComponent("Booze Base 광고성 이메일 무료 수신거부");
  const htmlBody = "" +
    "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0\">신청하신 제품의 확인 가격과 페어링 정보를 정리했습니다.</div>" +
    "<div style=\"margin:0;padding:32px 12px;background:#10110e;color:#eee7d7;font-family:Arial,'Malgun Gothic',sans-serif\">" +
    "<div style=\"max-width:620px;margin:0 auto;border:1px solid #39352b;background:#171813\">" +
    "<div style=\"padding:24px 28px;border-bottom:1px solid #40392d\"><div style=\"color:#dfb87d;font-size:11px;letter-spacing:3px\">Booze Base</div><div style=\"margin-top:7px;color:#f0e8d7;font-family:Georgia,serif;font-size:24px\">Booze Base</div></div>" +
    "<div style=\"padding:27px 28px 18px\"><p style=\"margin:0 0 12px;color:#dfb87d;font-size:11px;letter-spacing:1px\">MY LIST · 입고 알림 신청 안내</p><h1 style=\"margin:0 0 14px;color:#f1eada;font-family:Georgia,'Malgun Gothic',serif;font-size:23px;font-weight:400;line-height:1.5\">" + escapeHtml_(topic) + "</h1><p style=\"margin:0;color:#b8b19f;font-size:13px;line-height:1.8\">나의 관심 리스트(My List)로 신청하신 주류의 판매처 공개 정보와 확인 가격, 추천 페어링 아이템을 한곳에 정리했습니다. 아래 가격은 확인일 기준 참고값이며 현재 가격이나 재고를 보장하지 않습니다.</p></div>" +
    productBlocks +
    "<div style=\"padding:20px 28px 25px;border-top:1px solid #40392d;color:#a8a18f;font-size:11px;line-height:1.8\"><p style=\"margin:0 0 10px;color:#d1c8b4\">광고·제휴 안내</p><p style=\"margin:0 0 14px\">이 메일에는 쿠팡 파트너스 제휴 링크가 포함되어 있습니다. 링크를 통한 구매가 발생하면 운영자가 일정액의 수수료를 제공받을 수 있습니다. 제휴 링크는 페어링 식품·식기류를 위한 링크입니다.</p><p style=\"margin:0 0 8px\">운영자 연락처: <a href=\"mailto:" + escapeHtml_(contact) + "\" style=\"color:#dfb87d\">" + escapeHtml_(contact) + "</a></p><p style=\"margin:0\">이 광고성 메일을 원치 않으시면 무료로 <a href=\"" + escapeHtml_(unsubscribeUrl) + "\" style=\"color:#dfb87d\">수신거부 요청</a>을 보내 주세요. 접수 후 다음 발송부터 제외합니다.</p></div>" +
    "</div><p style=\"max-width:620px;margin:12px auto 0;color:#777366;font-size:10px;line-height:1.7\">판매처 가격·재고는 확인 시점 이후 변동될 수 있습니다. 주류 판매·결제·예약은 이 서비스에서 제공하지 않습니다.</p></div>";
  const textBlocks = products.map(function (product) {
    return product.name + "\n확인 가격: " + formatPrice_(product.price) + " (" + product.checked + ")\n판매처 출처: " + product.sourceUrl + "\n페어링: " + product.pairing + "\n" + product.note + "\n";
  }).join("\n");
  const textBody = "Booze Base — 입고 알림 신청 안내\n\n" + textBlocks + "\n제휴 안내: 이 메일의 쿠팡 파트너스 링크를 통한 구매 시 운영자가 일정액의 수수료를 받을 수 있습니다.\n운영자 연락처: " + contact + "\n무료 수신거부: " + unsubscribeUrl + "\n가격·재고는 확인 시점 이후 변동될 수 있습니다.";
  return { subject: subject, htmlBody: htmlBody, textBody: textBody };
}

function buildProductBlock_(product) {
  const sourceUrl = isHttpsUrl_(product.sourceUrl) ? product.sourceUrl : "#";
  const affiliateUrl = isHttpsUrl_(product.affiliateUrl) ? product.affiliateUrl : "";
  const affiliateButton = affiliateUrl
    ? "<a href=\"" + escapeHtml_(affiliateUrl) + "\" style=\"display:inline-block;margin-top:13px;padding:12px 15px;background:#dfb87d;color:#16150f;text-decoration:none;font-size:12px;font-weight:bold\">어울리는 페어링 안주 로켓배송 보기 ↗</a><p style=\"margin:8px 0 0;color:#9a927f;font-size:10px;line-height:1.6\">쿠팡 파트너스 광고·제휴 링크입니다. 링크 구매 시 운영자가 일정 수수료를 받을 수 있습니다.</p>"
    : "";
  return "<div style=\"padding:0 28px 24px\"><div style=\"padding:18px;background:#20211a;border:1px solid #363429\"><div style=\"color:#f0e8d7;font-family:Georgia,'Malgun Gothic',serif;font-size:17px\">" + escapeHtml_(product.name) + "</div><div style=\"margin-top:12px;color:#dfb87d;font-size:22px;font-weight:bold\">" + formatPrice_(product.price) + "</div><div style=\"margin-top:4px;color:#a8a18f;font-size:10px\">확인일 " + escapeHtml_(product.checked) + " · " + escapeHtml_(product.source) + "</div><p style=\"margin:11px 0 0;color:#b8b19f;font-size:11px;line-height:1.7\">" + escapeHtml_(product.note) + "</p><p style=\"margin:10px 0 0;color:#d2c8b4;font-size:12px\">페어링 노트: " + escapeHtml_(product.pairing) + "</p><a href=\"" + escapeHtml_(sourceUrl) + "\" style=\"display:inline-block;margin-top:10px;color:#dfb87d;font-size:11px\">가격 출처 페이지 보기 ↗</a>" + affiliateButton + "</div></div>";
}

function resolveProducts_(productId) {
  const raw = String(productId || "all").trim();
  if (!raw || raw === "all") {
    return FEATURED_FOR_ALL.map(function (k) { return PRODUCT_CATALOG[k]; }).filter(Boolean);
  }
  const seen = {};
  const ids = raw.split(",").map(function (part) { return String(part || "").trim(); }).filter(function (key) {
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
  return ids.map(function (productKey) { return PRODUCT_CATALOG[productKey]; }).filter(Boolean);
}

function getOperatorContact_() {
  const effective = Session.getEffectiveUser().getEmail();
  const active = Session.getActiveUser().getEmail();
  const contact = String(effective || active || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    throw new Error("운영자 계정 이메일을 확인할 수 없습니다. 스크립트를 소유자 계정으로 실행하거나 발신 연락처를 설정해 주세요.");
  }
  return contact;
}

function getWaitlistSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Bind this script to the destination spreadsheet.");
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  ensureHeaderRow_(sheet);
  return sheet;
}

function ensureHeaderRow_(sheet) {
  ensureCustomHeaderRow_(sheet, HEADERS);
}

function ensureCustomHeaderRow_(sheet, targetHeaders) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(targetHeaders);
    sheet.setFrozenRows(1);
    return;
  }
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || "").trim(); });
  targetHeaders.forEach(function (header) {
    if (existingHeaders.indexOf(header) === -1) {
      const nextColumn = Math.max(sheet.getLastColumn(), existingHeaders.length) + 1;
      sheet.getRange(1, nextColumn).setValue(header);
      existingHeaders.push(header);
    }
  });
  sheet.setFrozenRows(1);
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      // Google Form-style URL-encoded payloads are also accepted.
    }
  }
  return (e && e.parameter) || {};
}

function parseConsent_(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function sanitizeText_(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength || 200);
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatPrice_(value) {
  return "₩" + Math.round(Number(value) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function escapeHtml_(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
  });
}

function isHttpsUrl_(value) {
  return /^https:\/\//i.test(String(value || ""));
}
