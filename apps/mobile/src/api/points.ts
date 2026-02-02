import { api } from "./client";

export type RecommendQuota = {
    ok: true;
    kstDate: string;
    remaining: number;
    freeLimit: number;
    adBonus: number;
    adGranted: boolean;
};

export type PointsBalance = {
    ok: true;
    balance: number;
};

export type LedgerItem = {
    id: string;
    kind: "EARN" | "SPEND" | "ADJUST";
    source: string;
    sourceId?: string | null;
    points: number;
    balanceAfter: number;
    note?: string | null;
    createdAt: string;
};

export type LedgerResponse = {
    ok: true;
    items: LedgerItem[];
    nextCursor: string | null;
};

export async function fetchRecommendQuota(): Promise<RecommendQuota> {
    const { data } = await api.get("/me/recommend-quota");
    return data;
}

export async function watchAdQuota(): Promise<RecommendQuota> {
    const { data } = await api.post("/me/recommend-quota/watch-ad");
    return data;
}

export async function fetchMyPoints(): Promise<PointsBalance> {
    const { data } = await api.get("/me/points");
    return data;
}

export async function fetchPointLedger(params?: {
    take?: number;
    cursor?: string | null;
}): Promise<LedgerResponse> {
    const take = params?.take ?? 20;
    const cursor = params?.cursor ?? null;

    const qs = new URLSearchParams();
    qs.set("take", String(take));
    if (cursor) qs.set("cursor", cursor);

    const { data } = await api.get(`/me/points/ledger?${qs.toString()}`);
    return data;
}
