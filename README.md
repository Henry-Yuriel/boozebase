# Booze Base (Booze Base) — 한국 프리미엄 주류 가격 트래커 & 페어링 아카이브

빌드 도구나 별도 백엔드 서버 없이 동작하는 정적 Jamstack 웹 애플리케이션입니다. `index.html`이 `config.js`, `app.js`, `liquor_data.json`을 읽어 브라우저에서 렌더링하며, Google Sheets + Apps Script(`Code.gs`)를 서버리스 백엔드로 활용합니다.

- **운영 URL**: https://boozebase.netlify.app

---

## 주요 기능 (Phase 3 & My List 업그레이드 반영 완료)

1. **주류 가격 아카이브 & 클라이언트 페이지네이션 (`PAGE_SIZE = 12`)**
   - 150ms 디바운스 검색 및 카테고리 탭 필터(전체 / 위스키 / 사케 / 와인)를 지원합니다.
   - 상품 수가 100개 이상으로 늘어나도 초기 렌더링 속도가 저하되지 않도록 12개 단위 `+ 더 많은 셀렉션 보기` 페이지네이션이 적용되어 있습니다.
2. **3단계 쿠팡 파트너스 링크 자동 매칭 (`resolveAffiliateLink`)**
   - **1순위**: `config.js`의 `affiliate.links[product_id]` 또는 `liquor_data.json`의 개별 파트너스 링크
   - **2순위**: `config.js`의 `affiliate.pairingCategoryLinks` 키워드 사전 (하몽, 치즈, 사시미, 굴, 초콜릿, 견과류, 스테이크 등 31개 안주 키워드를 발급 완료된 쿠팡 파트너스 단축 링크에 자동 매핑)
   - **3순위**: 미매칭 시 일반 쿠팡 검색 URL 폴백 (파트너스 수수료 미발생 구분 고지)
3. **내 관심 리스트 (`My List`) & 통합 재입고·페어링 알림 신청**
   - 카드마다 반복되던 개별 이메일 입력창을 제거하고, `♡ 관심 주류 담기` 버튼과 우측 슬라이드 드로어(`내 관심 리스트 ♥`)로 통합했습니다.
   - 방문자가 여러 주류를 위시리스트에 담은 뒤 이메일을 한 번만 입력하면, 쉼표로 구분된 `product_id`·`product_name` 목록이 Google Sheets `Waitlist` 시트에 일괄 등록됩니다.
   - `Code.gs`의 이메일 발송기가 다중 상품을 인식하여 **하나의 통합 다이제스트 이메일**로 모든 관심 주류의 가격표와 안주 페어링 링크를 묶어 발송합니다.
4. **커뮤니티 페어링 노트 (`Reviews` 시스템)**
   - 각 주류 카드의 `💬 리뷰 (N)` 버튼 및 하단 `커뮤니티 페어링 노트` 섹션에서 사용자들이 직접 안주 궁합 별점과 한줄평을 남기고 조회할 수 있습니다.
   - 작성된 리뷰는 브라우저 `localStorage`에 즉시 반영되며, 동시에 Google Sheets의 `Reviews` 시트로 전송(`action: "submit_review"`)되어 영구 보관됩니다.
5. **대량 카탈로그 변환 도구 (`tools/`)**
   - `tools/catalog_template.csv` 파일을 엑셀이나 메모장으로 편집한 뒤 아래 명령어로 `liquor_data.json`에 즉시 병합할 수 있습니다.
   - **Windows PowerShell (Python 미설치 환경 기본 지원)**:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\tools\csv_to_catalog.ps1
     ```
   - **Python 3 환경**:
     ```bash
     python tools/csv_to_catalog.py tools/catalog_template.csv --output liquor_data.json
     ```

---

## 설정 및 배포 가이드

### 1. `config.js`
- `siteUrl`: `"https://boozebase.netlify.app"`으로 설정되어 있습니다.
- `email.endpoint`: Google Apps Script 웹 앱 배포 URL이 연결되어 있습니다.
- `affiliate.links` 및 `affiliate.pairingCategoryLinks`: 발급받은 쿠팡 파트너스 단축 URL이 매핑되어 있습니다.

### 2. Google Sheets (`Code.gs`) 업데이트 방법
1. 연결된 Google 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
2. 기존 코드를 지우고 이 프로젝트의 [`Code.gs`](./Code.gs) 전체 내용을 붙여넣은 뒤 저장합니다.
3. 우측 상단 **배포 → 배포 관리 → 수정(연필 아이콘) → 버전: '새 버전' 선택 → 배포**를 클릭합니다.
   - 기존 웹 앱 URL을 유지하려면 새 배포 대신 **배포 관리 → 새 버전**으로 업데이트하는 것이 가장 편리합니다.
   - 만약 새 웹 앱 URL이 발급되었다면 `config.js`의 `email.endpoint` 값만 새 URL로 교체하세요.
4. 첫 리뷰가 등록되거나 스프레드시트를 새로고침하면 `Waitlist` 시트 외에 `Reviews` 시트가 자동으로 생성됩니다.

### 3. Netlify 정적 배포 (`boozebase.netlify.app`)
1. [Netlify 대시보드](https://app.netlify.com/)에서 `boozebase` 사이트의 **Deploys** 탭으로 이동합니다.
2. 프로젝트 폴더(`liquarTracker_prj`) 또는 생성된 `liquortrack-final-deploy.zip` 파일을 드래그 앤 드롭하여 즉시 배포합니다.

---

## 공개 전 법적·운영 유의사항

- **주류광고 관련 검토**: 국민건강증진법 제8조의2는 주류 제조·판매 면허 보유자와 수입자 외의 주류광고를 제한합니다. `Code.gs`의 `ALCOHOL_AD_EMAILS_AUTHORIZED`는 기본 `false`로 설정되어 있으며, 법률 검토 전에는 이메일 발송 메뉴 실행을 차단합니다.
- **경제적 이해관계 고지**: 공정거래위원회 추천·보증 표시광고 심사지침에 따라 페이지 상단과 각 제휴 버튼 바로 아래에 쿠팡 파트너스 수수료 안내 문구를 명시했습니다.
- 상세 체크리스트와 홍보 원고 초안은 [`MARKETING_KIT.md`](./MARKETING_KIT.md), 가격 출처는 [`PRICE_SOURCES.md`](./PRICE_SOURCES.md), 이미지 출처는 [`ASSET_SOURCES.md`](./ASSET_SOURCES.md)를 참고하세요.
