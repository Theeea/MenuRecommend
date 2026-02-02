type Ingredient = { id: string; name: string };

// ✅ 너희 API 베이스 주소로 맞춰
// 예: EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
const API_BASE =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    "http://localhost:3000";

function url(path: string) {
    return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * ✅ 재료 마스터 목록 조회
 * - 아래 엔드포인트 "/ingredients" 를 너희 백엔드 라우트에 맞게 수정
 */
export async function fetchIngredients(): Promise<Ingredient[]> {
    const res = await fetch(url("/ingredients"), {
        method: "GET",
        headers: { Accept: "application/json" },
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
        throw new Error(json?.message || `재료 목록 조회 실패 (${res.status})`);
    }

    // 응답이 { data: [...] } 이거나 그냥 [...] 일 수도 있어서 둘 다 대응
    const list = (json?.data ?? json ?? []) as any[];
    return list.map((x) => ({
        id: String(x.id ?? x.ID ?? x.ingredient_id ?? x.INGREDIENT_ID),
        name: String(x.name ?? x.NAME ?? x.title ?? x.TITLE),
    }));
}

/**
 * ✅ 유저가 선택한 재료 저장
 * - 아래 엔드포인트 "/user/taste" 를 너희 백엔드 라우트에 맞게 수정
 */
export async function saveUserIngredients(token: string, ingredientIds: string[]): Promise<void> {
    const res = await fetch(url("/user/taste"), {
        method: "PUT",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ingredientIds }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
        throw new Error(json?.message || `저장 실패 (${res.status})`);
    }
}
