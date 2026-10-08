// ============================================================
//  딜센트 핫딜 목록  (매일 이 파일만 수정하면 됩니다)
// ============================================================
//
//  딜 하나는 { ... }, 로 적습니다. 맨 위에 있는 딜이 제일 먼저 보여요.
//  새 딜을 올릴 때는 아래 샘플 한 덩어리를 복사해서 [ 바로 아래에 붙여넣으세요.
//
//  store    : "coupang" | "musinsa" | "naver" | "toss"   (필수)
//  title    : 상품 이름                                    (필수)
//  url      : 내 제휴 링크 (파트너스에서 만든 링크)           (필수)
//  price    : 지금 가격 (숫자만, 쉼표 없이)                  (선택)
//  original : 원래 가격 (숫자만) - 넣으면 할인율이 자동 계산돼요 (선택)
//  badge    : 가격 정보가 없을 때 스티커에 쓸 글자 (예: "쿠폰", "무료배송") (선택)
//  note     : 한 줄 메모 (예: "카드 할인가", "오늘만") (선택)
//  emoji    : 이미지가 없을 때 대신 보여줄 이모지 (선택)
//  image    : 상품 이미지 주소 (선택, 있으면 emoji 대신 표시)
//  expires  : 마감 시각 "2026-10-09 23:59" (선택, 지나면 자동으로 '마감' 처리)
//
//  주의: 글자는 "따옴표"로 감싸고, 한 덩어리가 끝날 때마다 쉼표(,)를 꼭 붙이세요.
// ============================================================

const DEALS = [
  {
    store: "coupang",
    title: "수뜰리에 퍼퓸 고체 탈취제, 밤쉘향, 310g, 2개",
    url: "https://toss.shopping/_m/Rsh0TMIy",
    price: 6930,
    original: 79000,
    note: "와우 회원 무료배송",
    emoji: "🎧",
    expires: "2026-12-31 23:59",
  },
  {
    store: "musinsa",
    title: "[샘플] 오버핏 후드 집업 (3컬러)",
    url: "https://www.musinsa.com/",
    price: 45000,
    original: 69000,
    note: "쿠폰 적용가",
    emoji: "🧥",
    expires: "2026-12-31 23:59",
  },
  {
    store: "naver",
    title: "[샘플] 대용량 물티슈 100매 20팩",
    url: "https://shopping.naver.com/",
    price: 16900,
    original: 24900,
    note: "네이버 플러스 멤버십 추가 적립",
    emoji: "🧻",
    expires: "2026-12-31 23:59",
  },
  {
    store: "toss",
    title: "[샘플] 토스페이 결제 시 추가 할인 쿠폰",
    url: "https://toss.im/",
    badge: "쿠폰",
    note: "결제 금액 5% 할인, 선착순",
    emoji: "🎟️",
    expires: "2026-12-31 23:59",
  },
  {
    store: "coupang",
    title: "[샘플] 로켓배송 생수 2L 12병",
    url: "https://www.coupang.com/",
    price: 6900,
    original: 9900,
    emoji: "💧",
    expires: "2026-12-31 23:59",
  },
  {
    store: "musinsa",
    title: "[샘플] 지난 시즌 러닝화 마감 임박",
    url: "https://www.musinsa.com/",
    price: 59000,
    original: 129000,
    note: "이미 끝난 딜은 이렇게 흐리게 보여요",
    emoji: "👟",
    expires: "2026-01-01 00:00",
  },
];
