import { apiGet, apiPost } from "./client";

export type RecommendQuota = {
    ok: true;
    kstDate: string;
    remaining: number;
    freeLimit: number;
    adBonus: number;
    adGranted: boolean;
};

export type RecommendResponse =
    | {
    ok: true;
    mode: string;
    session: { id: string; status: string; createdAt: string; challengeCode?: string | null };
    menu: { id: string; name: string; cuisine: string; dishType?: string | null };
    warnings: any[];
}
    | {
    ok: false;
    message: string;
};

export type DailyLimitResponse = {
    code: "RECOMMEND_DAILY_LIMIT";
    message: string;
    canWatchAd: boolean;
    kstDate: string;
};

export async function getQuota(): Promise<RecommendQuota> {
    return apiGet<RecommendQuota>("/me/recommend-quota");
}

export async function watchAd(): Promise<RecommendQuota> {
    return apiPost<RecommendQuota>("/me/recommend-quota/watch-ad");
}

export async function recommend(): Promise<RecommendResponse | DailyLimitResponse> {
    // body는 현재 {}로 사용
    return apiPost<any>("/recommend", {});
}
