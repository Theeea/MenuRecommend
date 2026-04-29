import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
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
    sourceId?: string | null;
    proofId?: string | null;
    points: number;
    balanceAfter?: number | null;
    note?: string | null;
    createdAt: string;
};

type ProofItem = {
    id: string;
    sessionId: string;
    rawUrl?: string | null;
    imageUrl: string;
    aiResult: "PENDING" | "HOLD" | "PASS" | "FAIL";
    aiScore: number;
    createdAt: string;
    reviewedAt: string | null;
    isProcessing: boolean;
    earnedPoints: number; // PASS 시 실제 지급된 점수(없으면 0)
    holdReason: "QUOTA" | "FILE" | "QR" | "REVIEW" | null;
    menu: { id: string; name: string } | null;

    // 서버가 그대로 내려줄 수도 있는 레거시 필드 대비(타입엔 안 쓰지만 any로 접근)
    // aiMeta?: any;
};

type TimelineItem =
    | { type: "proof"; createdAt: string; proof: ProofItem }
    | { type: "ledger"; createdAt: string; ledger: LedgerItem };

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

function fmtNumber(n: number) {
    return (Number(n) || 0).toLocaleString("ko-KR");
}

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
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

function extractToken(raw: any): string {
    if (!raw) return "";

    if (typeof raw === "string") {
        let t = raw.trim();
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            t = t.slice(1, -1).trim();
        }
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
            } catch {}
        }
        return t;
    }

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
    t = t.replace(/^Bearer\s+Bearer\s+/i, "Bearer ").trim();
    if (!t) return { auth: "" };
    const auth = /^Bearer\s+/i.test(t) ? t : `Bearer ${t}`;
    return { auth };
}

function toAbsoluteUrl(url: string) {
    const u = String(url ?? "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("/")) return `${API_BASE}${u}`;
    return `${API_BASE}/${u}`;
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

    const url1 = `${API_BASE}${path}`;
    let r = await doFetch(url1);

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

function proofStatusLabel(aiResult: ProofItem["aiResult"], isProcessing: boolean) {
    if (aiResult === "PENDING") return isProcessing ? "진행중" : "검토중";
    if (aiResult === "PASS") return "승인";
    if (aiResult === "FAIL") return "거절";
    return "보류"; // HOLD
}

function proofPointsText(p: ProofItem) {
    if (p.aiResult === "PASS") return `+${fmtNumber(p.earnedPoints)}점 (승인)`;
    if (p.aiResult === "FAIL") return `+0점 (거절)`;
    if (p.aiResult === "HOLD") return `+0점 (보류)`;
    return `+0점 (${p.isProcessing ? "진행중" : "검토중"})`;
}

// ✅ rawUrl 우선순위 계산(서버가 rawUrl을 안 주고 aiMeta.rawUrl만 주는 케이스까지 커버)
function getRawUrl(p: ProofItem): string | null {
    const direct = typeof p.rawUrl === "string" ? p.rawUrl : null;
    if (direct) return direct;

    const metaRaw =
        (p as any)?.aiMeta && typeof (p as any).aiMeta?.rawUrl === "string"
            ? (p as any).aiMeta.rawUrl
            : null;

    return metaRaw ?? null;
}

export default function PointsScreen() {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const pagerRef = useRef<ScrollView>(null);

    const { token: tokenRaw, signOut: logout } = useAuth();

    const [tab, setTab] = useState<0 | 1>(0); // 0=사용, 1=내역
    const [balance, setBalance] = useState<number>(0);

    const [ledger, setLedger] = useState<LedgerItem[]>([]);
    const [ledgerNextCursor, setLedgerNextCursor] = useState<string | null>(null);

    const [proofs, setProofs] = useState<ProofItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usedUrl, setUsedUrl] = useState<string>("");

    // ✅ 이미지 크게보기(모달)
    const [imgModal, setImgModal] = useState<{
        visible: boolean;
        uri: string;
        title: string;
        sub: string;
    }>({ visible: false, uri: "", title: "", sub: "" });

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
        const take = 30;
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

        // ✅ Proof는 우리가 별도로 보여줄 거라 ledger PROOF는 제외(중복 방지)
        const filtered = items.filter((x) => String(x?.source ?? "").toUpperCase() !== "PROOF");

        setLedgerNextCursor(next);
        if (append) setLedger((prev) => [...prev, ...filtered]);
        else setLedger(filtered);
    };

    const loadProofs = async () => {
        const qs = new URLSearchParams();
        qs.set("take", "20");
        const r = await apiFetch<any>(`/me/proofs?${qs.toString()}`, tokenRaw);
        setUsedUrl(r.usedUrl);

        const res = r.data;
        const rawItems: any[] = res?.items ?? res?.data?.items ?? [];

        // ✅ rawUrl을 서버가 안 주는 경우(aiMeta.rawUrl만 존재)에도 채워줌
        const items: ProofItem[] = rawItems.map((it) => ({
            ...it,
            rawUrl:
                (typeof it?.rawUrl === "string" && it.rawUrl) ||
                (typeof it?.aiMeta?.rawUrl === "string" && it.aiMeta.rawUrl) ||
                null,
        }));

        setProofs(items);
    };

    const handle401 = () => {
        setError("세션이 만료되었거나 토큰이 유효하지 않아요. 로그아웃 후 다시 로그인해 주세요.");
    };

    const refreshAll = async () => {
        if (!canCallApi) return;
        setRefreshing(true);
        setError(null);
        try {
            await Promise.all([loadBalance(), loadLedger(null, false), loadProofs()]);
        } catch (e: any) {
            if (e?.status === 401 || String(e?.message ?? "").includes("HTTP 401")) handle401();
            else setError(String(e?.message ?? e));
        } finally {
            setRefreshing(false);
        }
    };

    const loadMore = async () => {
        if (!canCallApi) return;
        if (!ledgerNextCursor) return;
        if (loadingMore) return;

        setLoadingMore(true);
        setError(null);
        try {
            await loadLedger(ledgerNextCursor, true);
        } catch (e: any) {
            if (e?.status === 401 || String(e?.message ?? "").includes("HTTP 401")) handle401();
            else setError(String(e?.message ?? e));
        } finally {
            setLoadingMore(false);
        }
    };

    // ✅ PENDING이 있으면 내역 탭에서만 가볍게 폴링 (10초)
    useEffect(() => {
        if (!canCallApi) return;
        if (tab !== 1) return;
        const hasPending = proofs.some((p) => p.aiResult === "PENDING" || p.isProcessing);
        if (!hasPending) return;

        const t = setInterval(() => {
            loadProofs().catch(() => {});
            loadBalance().catch(() => {});
        }, 10000);

        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canCallApi, tab, proofs]);

    useEffect(() => {
        if (!canCallApi) return;
        setLoading(true);
        refreshAll().finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canCallApi]);

    const timeline: TimelineItem[] = useMemo(() => {
        const a: TimelineItem[] = [];

        for (const p of proofs) a.push({ type: "proof", createdAt: p.createdAt, proof: p });
        for (const l of ledger) a.push({ type: "ledger", createdAt: l.createdAt, ledger: l });

        a.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
        return a;
    }, [proofs, ledger]);

    const openImageModal = (p: ProofItem) => {
        const raw = getRawUrl(p);
        const uri = toAbsoluteUrl(raw || p.imageUrl); // ✅ 유저는 raw 우선
        const title = p.menu?.name ? `인증: ${p.menu.name}` : "인증";
        const sub = proofPointsText(p);
        if (!uri) return;

        setImgModal({ visible: true, uri, title, sub });
    };

    const renderTimelineItem = ({ item }: { item: TimelineItem }) => {
        if (item.type === "proof") {
            const p = item.proof;
            const raw = getRawUrl(p);
            const thumb = toAbsoluteUrl(raw || p.imageUrl); // ✅ 유저 썸네일도 raw 우선
            const title = p.menu?.name ? `인증: ${p.menu.name}` : "인증";
            const label = proofStatusLabel(p.aiResult, p.isProcessing);

            return (
                <View
                    style={{
                        flexDirection: "row",
                        gap: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderBottomWidth: 1,
                        borderColor: "#EFEFEF",
                        alignItems: "center",
                    }}
                >
                    <Pressable
                        onPress={() => openImageModal(p)}
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            overflow: "hidden",
                            backgroundColor: "#F3F4F6",
                        }}
                    >
                        {!!thumb ? (
                            <Image source={{ uri: thumb }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                        ) : (
                            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ fontWeight: "800" }}>🍽️</Text>
                            </View>
                        )}
                    </Pressable>

                    <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", color: "#111827", flex: 1 }}>
                                {title}
                            </Text>
                            <Text style={{ fontSize: 12, color: "#6B7280" }}>{fmtDate(p.createdAt)}</Text>
                        </View>

                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                            <Text style={{ fontSize: 13, color: "#111827", fontWeight: "700" }}>
                                {proofPointsText(p)}
                            </Text>
                            <Text style={{ fontSize: 12, color: "#6B7280" }}>{label}</Text>
                        </View>
                    </View>
                </View>
            );
        }

        const l = item.ledger;
        const sign = l.points >= 0 ? "+" : "";
        const title = l.note || l.kind || "포인트 변동";

        return (
            <View
                style={{
                    flexDirection: "row",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderBottomWidth: 1,
                    borderColor: "#EFEFEF",
                    alignItems: "center",
                }}
            >
                <View
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        backgroundColor: "#111827",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Text style={{ color: "#fff", fontWeight: "900" }}>P</Text>
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", flex: 1 }}>
                            {title}
                        </Text>
                        <Text style={{ fontSize: 12, color: "#6B7280" }}>{fmtDate(l.createdAt)}</Text>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                        <Text style={{ fontSize: 13, color: "#111827", fontWeight: "700" }}>
                            {sign}
                            {fmtNumber(l.points)}점
                        </Text>
                        {(l.balanceAfter ?? null) !== null ? (
                            <Text style={{ fontSize: 12, color: "#6B7280" }}>잔액 {fmtNumber(Number(l.balanceAfter))}P</Text>
                        ) : (
                            <Text style={{ fontSize: 12, color: "#6B7280" }} />
                        )}
                    </View>
                </View>
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
                <Text style={{ marginTop: 8, color: "#6B7280" }}>로그인 후 포인트를 확인할 수 있어요.</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, paddingTop: insets.top }}>
            {/* ✅ 이미지 크게보기 모달 */}
            <Modal
                visible={imgModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setImgModal((p) => ({ ...p, visible: false }))}
            >
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }}>
                    <Pressable
                        onPress={() => setImgModal((p) => ({ ...p, visible: false }))}
                        style={{ position: "absolute", top: insets.top + 10, right: 14, zIndex: 2, padding: 10 }}
                    >
                        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>✕</Text>
                    </Pressable>

                    <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 10 }}>
                        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }} numberOfLines={1}>
                            {imgModal.title}
                        </Text>
                        <Text style={{ color: "#D1D5DB", fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                            {imgModal.sub}
                        </Text>
                    </View>

                    <View style={{ flex: 1, padding: 12 }}>
                        <Image
                            source={{ uri: imgModal.uri }}
                            style={{ width: "100%", height: "100%", borderRadius: 14, backgroundColor: "#111827" }}
                            resizeMode="contain"
                        />
                    </View>

                    <View style={{ paddingBottom: insets.bottom + 14, paddingHorizontal: 16 }}>
                        <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
                            화면을 탭하면 닫혀요.
                        </Text>
                    </View>
                </View>
            </Modal>

            {/* 상단 잔액 */}
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
                <Text style={{ fontSize: 12, color: "#6B7280" }}>보유 포인트</Text>
                <Text style={{ fontSize: 28, fontWeight: "800", marginTop: 4 }}>{fmtNumber(balance)}P</Text>

                {__DEV__ && !!usedUrl && (
                    <Text style={{ marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>Used URL: {usedUrl}</Text>
                )}

                {!!error && (
                    <View
                        style={{
                            marginTop: 10,
                            padding: 10,
                            borderRadius: 12,
                            backgroundColor: "#FFF4F4",
                            borderWidth: 1,
                            borderColor: "#FFD0D0",
                        }}
                    >
                        <Text style={{ fontSize: 12, color: "#B42318", fontWeight: "700" }}>조회 실패</Text>
                        <Text style={{ marginTop: 4, fontSize: 12, color: "#B42318" }}>{error}</Text>

                        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                            <Pressable
                                onPress={refreshAll}
                                style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#111827" }}
                            >
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
                <Pressable
                    onPress={() => scrollToTab(0)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: tab === 0 ? "#111827" : "#F3F4F6" }}
                >
                    <Text style={{ textAlign: "center", color: tab === 0 ? "#FFFFFF" : "#111827", fontWeight: "700" }}>사용</Text>
                </Pressable>

                <Pressable
                    onPress={() => scrollToTab(1)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: tab === 1 ? "#111827" : "#F3F4F6" }}
                >
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

                {/* 내역(=Proof + Ledger 타임라인) */}
                <View style={{ width, flex: 1 }}>
                    {loading ? (
                        <View style={{ paddingTop: 24, alignItems: "center" }}>
                            <ActivityIndicator />
                        </View>
                    ) : (
                        <FlatList
                            data={timeline}
                            keyExtractor={(it) => (it.type === "proof" ? `proof:${it.proof.id}` : `ledger:${it.ledger.id}`)}
                            renderItem={renderTimelineItem}
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
