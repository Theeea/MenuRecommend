import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/authStore";

type LedgerItem = {
    id: string;
    kind?: string | null;
    source?: string | null;
    points: number;
    balanceAfter?: number | null;
    note?: string | null;
    createdAt: string;
};

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

function fmtNumber(n: number) {
    return (Number(n) || 0).toLocaleString("ko-KR");
}

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function pickErrorMessage(json: any, fallbackText: string) {
    if (json?.code && json?.message) return `[${json.code}] ${json.message}`;
    if (typeof json?.message === "string") return json.message;
    if (Array.isArray(json?.message)) return json.message.join(", ");
    if (typeof json?.error?.message === "string") return json.error.message;
    if (typeof fallbackText === "string" && fallbackText.trim()) return fallbackText.trim();
    return "Request failed";
}

/**
 * ✅ authStore token이 다양한 형태여도 최대한 "JWT string"만 뽑아냄
 * - "Bearer xxx"
 * - "xxx"
 * - { accessToken: "xxx" } 같은 객체가 들어온 경우
 * - JSON 문자열 {"accessToken":"xxx"} 형태
 * - 따옴표 포함 "xxx"
 */
function extractToken(raw: any): string {
    if (!raw) return "";

    // 이미 string
    if (typeof raw === "string") {
        let t = raw.trim();

        // 따옴표로 감싸진 경우 제거
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            t = t.slice(1, -1).trim();
        }

        // JSON 문자열이면 파싱 시도
        if (t.startsWith("{") && t.endsWith("}")) {
            try {
                const obj = JSON.parse(t);
                const inner =
                    obj?.token ??
                    obj?.accessToken ??
                    obj?.access_token ??
                    obj?.jwt ??
                    obj?.idToken ??
                    "";
                if (typeof inner === "string") return inner.trim();
            } catch {
                // ignore
            }
        }

        return t;
    }

    // 객체 형태면 대표 필드들에서 token 추출
    if (typeof raw === "object") {
        const t =
            raw.token ??
            raw.accessToken ??
            raw.access_token ??
            raw.jwt ??
            raw.idToken ??
            raw.id_token ??
            "";
        return typeof t === "string" ? t.trim() : "";
    }

    return "";
}

function normalizeAuthHeader(rawToken: any) {
    let t = extractToken(rawToken);

    // "Bearer Bearer xxx" 같은 꼴 방지
    t = t.replace(/^Bearer\s+Bearer\s+/i, "Bearer ").trim();

    if (!t) return { auth: "", tokenPreview: "(empty)" };

    // 이미 Bearer 있으면 유지
    const auth = /^Bearer\s+/i.test(t) ? t : `Bearer ${t}`;

    // 디버그 표시용
    const tokenOnly = auth.replace(/^Bearer\s+/i, "");
    const tokenPreview =
        tokenOnly.length > 24
            ? `${tokenOnly.slice(0, 8)}...${tokenOnly.slice(-8)}`
            : tokenOnly;

    return { auth, tokenPreview };
}

async function apiFetch<T>(
    path: string,
    rawToken: any,
    init?: RequestInit
): Promise<{ data: T; usedUrl: string }> {
    const { auth } = normalizeAuthHeader(rawToken);

    const headers = {
        ...(init?.headers ?? {}),
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
    };

    const doFetch = async (url: string) => {
        const res = await fetch(url, { ...(init ?? {}), headers });
        const text = await res.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }
        return { res, text, json, url };
    };

    // 1차
    const url1 = `${API_BASE}${path}`;
    let r = await doFetch(url1);

    // 404면 /api prefix 한번만
    if (r.res.status === 404 && !path.startsWith("/api/")) {
        const url2 = `${API_BASE}/api${path}`;
        r = await doFetch(url2);
    }

    if (!r.res.ok) {
        const msg = pickErrorMessage(r.json, r.text);
        const code = r.json?.code ? ` code=${r.json.code}` : "";
        const hint = `HTTP ${r.res.status}${code} path=${path} url=${r.url}`;
        const err: any = new Error(`${msg} (${hint})`);
        err.status = r.res.status;
        throw err;
    }

    return { data: (r.json ?? ({} as any)) as T, usedUrl: r.url };
}

export default function PointsScreen() {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const pagerRef = useRef<ScrollView>(null);

    // ✅ token 필드명이 다를 수 있어서 넓게 잡음
    const tokenRaw = useAuth((s: any) => s.token ?? s.accessToken ?? s.access_token ?? s.jwt);
    const logout = useAuth((s: any) => s.logout) as undefined | (() => void);

    const { tokenPreview } = useMemo(() => normalizeAuthHeader(tokenRaw), [tokenRaw]);

    const [tab, setTab] = useState<0 | 1>(0); // 0=사용, 1=내역
    const [balance, setBalance] = useState<number>(0);

    const [ledger, setLedger] = useState<LedgerItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usedUrl, setUsedUrl] = useState<string>("");

    const canCallApi = useMemo(() => Boolean(API_BASE && tokenRaw), [tokenRaw]);

    const scrollToTab = (next: 0 | 1) => {
        setTab(next);
        pagerRef.current?.scrollTo({ x: width * next, animated: true });
    };

    const loadBalance = async () => {
        const r = await apiFetch<any>("/me/points", tokenRaw);
        setUsedUrl(r.usedUrl);

        const res = r.data;
        const pointBalance =
            res?.pointBalance ??
            res?.balance ??
            res?.data?.pointBalance ??
            res?.data?.balance ??
            res?.contents?.pointBalance ??
            0;

        setBalance(Number(pointBalance) || 0);
    };

    const loadLedger = async (cursor?: string | null, append = false) => {
        const take = 20;
        const qs = new URLSearchParams();
        qs.set("take", String(take));
        if (cursor) qs.set("cursor", cursor);

        const r = await apiFetch<any>(`/me/points/ledger?${qs.toString()}`, tokenRaw);
        setUsedUrl(r.usedUrl);

        const res = r.data;
        const items: LedgerItem[] =
            res?.items ??
            res?.data?.items ??
            res?.ledger ??
            res?.data?.ledger ??
            [];

        const next: string | null = res?.nextCursor ?? res?.data?.nextCursor ?? null;
        setNextCursor(next);

        if (append) setLedger((prev) => [...prev, ...items]);
        else setLedger(items);
    };

    const handle401 = () => {
        // ✅ 토큰 만료/서명불일치/다른 서버로 요청 등
        setError("세션이 만료되었거나 토큰이 유효하지 않아요. 로그아웃 후 다시 로그인해 주세요.");
    };

    const refreshAll = async () => {
        if (!canCallApi) return;
        setRefreshing(true);
        setError(null);
        try {
            await Promise.all([loadBalance(), loadLedger(null, false)]);
        } catch (e: any) {
            if (e?.status === 401 || String(e?.message ?? "").includes("HTTP 401")) {
                handle401();
            } else {
                setError(String(e?.message ?? e));
            }
        } finally {
            setRefreshing(false);
        }
    };

    const loadMore = async () => {
        if (!canCallApi) return;
        if (!nextCursor) return;
        if (loadingMore) return;

        setLoadingMore(true);
        setError(null);
        try {
            await loadLedger(nextCursor, true);
        } catch (e: any) {
            if (e?.status === 401 || String(e?.message ?? "").includes("HTTP 401")) {
                handle401();
            } else {
                setError(String(e?.message ?? e));
            }
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (!canCallApi) return;
        setLoading(true);
        refreshAll().finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canCallApi]);

    const renderLedgerItem = ({ item }: { item: LedgerItem }) => {
        const sign = item.points >= 0 ? "+" : "";
        return (
            <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: "#EFEFEF" }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700" }}>
                        {sign}
                        {fmtNumber(item.points)}P
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280" }}>{fmtDate(item.createdAt)}</Text>
                </View>

                <Text style={{ marginTop: 6, fontSize: 13, color: "#111827" }}>
                    {item.note || item.kind || "포인트 변동"}
                </Text>

                {(item.balanceAfter ?? null) !== null && (
                    <Text style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                        잔액: {fmtNumber(Number(item.balanceAfter))}P
                    </Text>
                )}
            </View>
        );
    };

    if (!API_BASE) {
        return (
            <View style={{ flex: 1, paddingTop: insets.top + 24, padding: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "700" }}>API 주소가 설정되지 않았어요</Text>
                <Text style={{ marginTop: 8, color: "#6B7280" }}>EXPO_PUBLIC_API_BASE_URL 환경변수를 확인해 주세요.</Text>
            </View>
        );
    }

    if (!tokenRaw) {
        return (
            <View style={{ flex: 1, paddingTop: insets.top + 24, padding: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "700" }}>로그인이 필요해요</Text>
                <Text style={{ marginTop: 8, color: "#6B7280" }}>로그인 후 포인트 내역을 확인할 수 있어요.</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, paddingTop: insets.top }}>
            {/* 상단 잔액 */}
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
                <Text style={{ fontSize: 12, color: "#6B7280" }}>보유 포인트</Text>
                <Text style={{ fontSize: 28, fontWeight: "800", marginTop: 4 }}>{fmtNumber(balance)}P</Text>

                {/* DEV 디버그 */}
                {__DEV__ && (
                    <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 11, color: "#6B7280" }}>API_BASE: {API_BASE}</Text>
                        {!!usedUrl && <Text style={{ fontSize: 11, color: "#6B7280" }}>Used URL: {usedUrl}</Text>}
                        <Text style={{ fontSize: 11, color: "#6B7280" }}>Token: {tokenPreview}</Text>
                    </View>
                )}

                {!!error && (
                    <View style={{ marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: "#FFF4F4", borderWidth: 1, borderColor: "#FFD0D0" }}>
                        <Text style={{ fontSize: 12, color: "#B42318", fontWeight: "700" }}>포인트 조회 실패</Text>
                        <Text style={{ marginTop: 4, fontSize: 12, color: "#B42318" }}>{error}</Text>

                        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                            <Pressable onPress={refreshAll} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#111827" }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>다시 시도</Text>
                            </Pressable>

                            {!!logout && (
                                <Pressable
                                    onPress={() => logout()}
                                    style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#6B7280" }}
                                >
                                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>로그아웃</Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                )}
            </View>

            {/* 탭 */}
            <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}>
                <Pressable onPress={() => scrollToTab(0)} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: tab === 0 ? "#111827" : "#F3F4F6" }}>
                    <Text style={{ textAlign: "center", color: tab === 0 ? "#FFFFFF" : "#111827", fontWeight: "700" }}>사용</Text>
                </Pressable>

                <Pressable onPress={() => scrollToTab(1)} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: tab === 1 ? "#111827" : "#F3F4F6" }}>
                    <Text style={{ textAlign: "center", color: tab === 1 ? "#FFFFFF" : "#111827", fontWeight: "700" }}>내역</Text>
                </Pressable>
            </View>

            {/* 스와이프 페이지 */}
            <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                    const next = Math.round(e.nativeEvent.contentOffset.x / width);
                    setTab(next === 0 ? 0 : 1);
                }}
            >
                {/* 사용 */}
                <View style={{ width, flex: 1, paddingHorizontal: 16 }}>
                    <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#EFEFEF" }}>
                        <Text style={{ fontSize: 15, fontWeight: "800" }}>포인트 사용 (준비중)</Text>
                        <Text style={{ marginTop: 8, color: "#6B7280", lineHeight: 18 }}>
                            추후 포인트로 기프티콘/아이템을 구매할 수 있도록 만들 예정이에요.
                        </Text>
                    </View>
                    <View style={{ height: 24 }} />
                </View>

                {/* 내역 */}
                <View style={{ width, flex: 1 }}>
                    {loading ? (
                        <View style={{ paddingTop: 24, alignItems: "center" }}>
                            <ActivityIndicator />
                        </View>
                    ) : (
                        <FlatList
                            data={ledger}
                            keyExtractor={(it) => it.id}
                            renderItem={renderLedgerItem}
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
                            onEndReachedThreshold={0.4}
                            onEndReached={loadMore}
                            ListEmptyComponent={
                                <View style={{ paddingTop: 40, alignItems: "center" }}>
                                    <Text style={{ color: "#6B7280" }}>{error ? "내역을 불러오지 못했어요." : "내역이 없어요."}</Text>
                                </View>
                            }
                            ListFooterComponent={
                                loadingMore ? (
                                    <View style={{ paddingVertical: 14 }}>
                                        <ActivityIndicator />
                                    </View>
                                ) : (
                                    <View style={{ height: 18 }} />
                                )
                            }
                        />
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
