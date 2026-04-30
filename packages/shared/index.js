const CUISINE_LABELS = {
  KOREAN: "한식",
  CHINESE: "중식",
  JAPANESE: "일식",
  WESTERN: "양식",
  ASIAN: "아시아",
  SNACK: "분식",
  FASTFOOD: "패스트푸드",
  SALAD: "샐러드",
  DESSERT: "디저트",
  ETC: "기타",
};

const DISH_TYPE_LABELS = {
  RICE: "밥류",
  NOODLE: "면류",
  SOUP: "국/탕",
  STEW: "찌개",
  GRILL: "그릴",
  STIR_FRY: "볶음",
  FRIED: "튀김",
  SALAD: "샐러드",
  BREAD: "빵/샌드위치",
  DESSERT: "디저트",
  OTHER: "기타",
};

const PROOF_RESULT_LABELS = {
  PENDING: "검토중",
  HOLD: "보류",
  PASS: "승인",
  FAIL: "거절",
};

const MENU_DRAFT_STATUS_LABELS = {
  PENDING: "검수 대기",
  APPROVED: "승인",
  REJECTED: "거절",
};

const RECOMMEND_STATUS_LABELS = {
  RECOMMENDED: "추천됨",
  ACCEPTED: "수락됨",
  PROOF_SUBMITTED: "인증 제출",
  DONE: "완료",
  CANCELLED: "취소됨",
};

const POINT_KIND_LABELS = {
  EARN: "적립",
  SPEND: "사용",
  ADJUST: "조정",
};

const POINT_SOURCE_LABELS = {
  PROOF: "음식 인증",
  ADMIN: "관리자",
  REDEEM: "교환",
  SYSTEM: "시스템",
};

const INGREDIENT_ROLE_LABELS = {
  MAIN: "주요 재료",
  SUB: "부재료",
  OPTIONAL: "선택 재료",
};

const REMOVABLE_LABELS = {
  YES: "제거 가능",
  NO: "제거 불가",
  UNKNOWN: "확인 필요",
};

function labelFrom(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || value;
}

function cuisineLabel(value, fallback = "아무거나") {
  return labelFrom(CUISINE_LABELS, value, fallback);
}

function dishTypeLabel(value, fallback = "기타") {
  return labelFrom(DISH_TYPE_LABELS, value, fallback);
}

function proofResultLabel(value, fallback = "") {
  return labelFrom(PROOF_RESULT_LABELS, value, fallback);
}

function menuDraftStatusLabel(value, fallback = "") {
  return labelFrom(MENU_DRAFT_STATUS_LABELS, value, fallback);
}

function recommendStatusLabel(value, fallback = "") {
  return labelFrom(RECOMMEND_STATUS_LABELS, value, fallback);
}

function pointKindLabel(value, fallback = "") {
  return labelFrom(POINT_KIND_LABELS, value, fallback);
}

function pointSourceLabel(value, fallback = "") {
  return labelFrom(POINT_SOURCE_LABELS, value, fallback);
}

function ingredientRoleLabel(value, fallback = "") {
  return labelFrom(INGREDIENT_ROLE_LABELS, value, fallback);
}

function removableLabel(value, fallback = "") {
  return labelFrom(REMOVABLE_LABELS, value, fallback);
}

module.exports = {
  CUISINE_LABELS,
  DISH_TYPE_LABELS,
  PROOF_RESULT_LABELS,
  MENU_DRAFT_STATUS_LABELS,
  RECOMMEND_STATUS_LABELS,
  POINT_KIND_LABELS,
  POINT_SOURCE_LABELS,
  INGREDIENT_ROLE_LABELS,
  REMOVABLE_LABELS,
  cuisineLabel,
  dishTypeLabel,
  proofResultLabel,
  menuDraftStatusLabel,
  recommendStatusLabel,
  pointKindLabel,
  pointSourceLabel,
  ingredientRoleLabel,
  removableLabel,
};
