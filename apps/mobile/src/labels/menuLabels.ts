export const CUISINE_LABELS: Record<string, string> = {
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

export const DISH_TYPE_LABELS: Record<string, string> = {
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

export function cuisineLabel(value?: string | null, fallback = "아무거나") {
    if (!value) return fallback;
    return CUISINE_LABELS[value] ?? value;
}

export function dishTypeLabel(value?: string | null, fallback = "기타") {
    if (!value) return fallback;
    return DISH_TYPE_LABELS[value] ?? value;
}
