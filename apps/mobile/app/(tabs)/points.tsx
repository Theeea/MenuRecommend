import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { pointKindLabel, pointSourceLabel, proofProcessingLabel, proofResultLabel } from "@menu-reward/shared";
import { useAuth } from "../../src/auth/authStore";

type LedgerItem = {
    id: string;
    kind?: string | null;
    source?: string | null;
    sourceId?: string | null;
    proofId?: string | null;
    proof?: {
        id: string;
        createdAt: string;
        session?: {
            menu?: { id: string; name: string } | null;
        } | null;
    } | null;
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
    hasCorrections?: boolean;
    correctionCount?: number;
    latestCorrection?: {
        at?: string | null;
        from?: string | null;
        to?: string | null;
        reason?: string | null;
    } | null;
    menu: { id: string; name: string } | null;

    // 서버가 그대로 내려줄 수도 있는 레거시 필드 대비(타입엔 안 쓰지만 any로 접근)
    // aiMeta?: any;
};

type ShopItem = {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    pricePoints: number;
    imageUrl?: string | null;
    stock?: number | null;
};

type PurchaseItem = {
    id: string;
    points: number;
    status: "REQUESTED" | "SENT" | "CANCELLED";
    createdAt: string;
    fulfilledAt?: string | null;
    cancelledAt?: string | null;
    shopItem?: {
        id: string;
        name: string;
        description?: string | null;
        category?: string | null;
        imageUrl?: string | null;
    } | null;
    itemSnapshot?: any;
};

type TimelineItem =
    | { type: "proof"; createdAt: string; proof: ProofItem }
    | { type: "ledger"; createdAt: string; ledger: LedgerItem };

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const SCREEN_BG = "#FFF6EE";
const CARD_BG = "#FFFFFF";
const INK = "#111827";

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

function fmtShortDate(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}.${mm}.${dd}`;
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
    if (aiResult === "PENDING" && isProcessing) return proofProcessingLabel();
    return proofResultLabel(aiResult, aiResult);
}

function proofPointsText(p: ProofItem) {
    if (p.aiResult === "PASS") return `+${fmtNumber(p.earnedPoints)}점 (${proofResultLabel("PASS")})`;
    if (p.aiResult === "FAIL") return `+0점 (${proofResultLabel("FAIL")})`;
    if (p.aiResult === "HOLD") return `+0점 (${proofResultLabel("HOLD")})`;
    return `+0점 (${p.isProcessing ? proofProcessingLabel() : proofResultLabel("PENDING")})`;
}

function parseCorrectionLedger(l: LedgerItem) {
    const note = String(l.note ?? "").trim();
    const correction = note.match(/^proof review correction\s+(PASS|FAIL)->(PASS|FAIL):\s*(.*)$/i);
    if (correction) {
        const from = proofResultLabel(correction[1].toUpperCase(), correction[1]);
        const to = proofResultLabel(correction[2].toUpperCase(), correction[2]);
        const reason = correction[3]?.trim();
        return { from, to, reason };
    }

    const koCorrection = note.match(/^인증 판정 정정\s+(.+?)->(.+?)(?::\s*(.*))?$/);
    if (koCorrection) {
        return {
            from: koCorrection[1].trim(),
            to: koCorrection[2].trim(),
            reason: koCorrection[3]?.trim(),
        };
    }

    return null;
}

function ledgerTitle(l: LedgerItem) {
    const correction = parseCorrectionLedger(l);
    if (correction) return "인증 판정 정정";

    const note = String(l.note ?? "").trim();
    if (note) return note;
    return pointKindLabel(l.kind, "") || "포인트 변동";
}

function ledgerSubtitle(l: LedgerItem) {
    const correction = parseCorrectionLedger(l);
    if (!correction) return "";
    return correction.reason
        ? `${correction.from} → ${correction.to} · ${correction.reason}`
        : `${correction.from} → ${correction.to}`;
}

function ledgerPointText(l: LedgerItem) {
    const sign = l.points >= 0 ? "+" : "";
    const correction = parseCorrectionLedger(l);
    if (correction) {
        return `${sign}${fmtNumber(l.points)}점 ${l.points < 0 ? "회수" : "지급"}`;
    }
    return `${sign}${fmtNumber(l.points)}점`;
}

function proofTitle(menuName?: string | null, createdAt?: string | null) {
    const date = fmtShortDate(createdAt);
    if (menuName && date) return `인증:${menuName}/${date}`;
    if (menuName) return `인증:${menuName}`;
    if (date) return `인증:${date}`;
    return "인증";
}

function correctionBadgeText(p: ProofItem) {
    if (!p.hasCorrections) return "";
    const latest = p.latestCorrection;
    if (latest?.from && latest?.to) {
        const from = proofResultLabel(latest.from, latest.from);
        const to = proofResultLabel(latest.to, latest.to);
        return `정정됨 ${from}→${to}`;
    }
    return p.correctionCount && p.correctionCount > 1 ? `정정됨 ${p.correctionCount}회` : "정정됨";
}

function correctionTitle(menuName?: string | null, createdAt?: string | null) {
    const date = fmtShortDate(createdAt);
    if (menuName && date) return `인증 판정 정정, ${menuName}/${date}`;
    if (menuName) return `인증 판정 정정, ${menuName}`;
    if (date) return `인증 판정 정정, ${date}`;
    return "인증 판정 정정";
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
    const [shopItems, setShopItems] = useState<ShopItem[]>([]);
    const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
    const [purchasingId, setPurchasingId] = useState<string | null>(null);

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

    const scrollToTab = async (next: 0 | 1) => {
        await Haptics.selectionAsync();
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

    const loadShop = async () => {
        try {
            const [itemsRes, purchasesRes] = await Promise.all([
                apiFetch<any>("/shop/items", tokenRaw),
                apiFetch<any>("/me/purchases?take=5", tokenRaw),
            ]);
            setUsedUrl(itemsRes.usedUrl);
            setShopItems(itemsRes.data?.items ?? itemsRes.data?.data?.items ?? []);
            setPurchases(purchasesRes.data?.items ?? purchasesRes.data?.data?.items ?? []);
        } catch {
            setShopItems([]);
            setPurchases([]);
        }
    };

    const handle401 = () => {
        setError("세션이 만료되었거나 토큰이 유효하지 않아요. 로그아웃 후 다시 로그인해 주세요.");
    };

    const refreshAll = async (withHaptic = false) => {
        if (!canCallApi) return;
        if (withHaptic) await Haptics.selectionAsync();
        setRefreshing(true);
        setError(null);
        try {
            await Promise.all([loadBalance(), loadLedger(null, false), loadProofs(), loadShop()]);
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
        refreshAll(false).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canCallApi]);

    const purchaseShopItem = async (item: ShopItem) => {
        if (purchasingId) return;
        if (balance < item.pricePoints) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("포인트 부족", `${fmtNumber(item.pricePoints)}P가 필요해요.`);
            return;
        }

        Alert.alert("구매 요청", `${item.name}\n${fmtNumber(item.pricePoints)}P를 사용할까요?`, [
            { text: "취소", style: "cancel" },
            {
                text: "구매",
                onPress: async () => {
                    setPurchasingId(item.id);
                    try {
                        const r = await apiFetch<any>("/shop/purchase", tokenRaw, {
                            method: "POST",
                            body: JSON.stringify({ itemId: item.id }),
                        });
                        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        setBalance(Number(r.data?.balance ?? balance - item.pricePoints) || 0);
                        await Promise.all([loadLedger(null, false), loadShop()]);
                        Alert.alert("구매 요청 완료", "관리자가 확인 후 모바일교환권을 발송할 예정이에요.");
                    } catch (e: any) {
                        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        if (e?.status === 409) {
                            Alert.alert("구매 실패", "포인트가 부족하거나 상품 재고가 없어요.");
                        } else {
                            Alert.alert("구매 실패", String(e?.message ?? e));
                        }
                    } finally {
                        setPurchasingId(null);
                    }
                },
            },
        ]);
    };

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
        const title = proofTitle(p.menu?.name, p.createdAt);
        const sub = proofPointsText(p);
        if (!uri) return;

        Haptics.selectionAsync().catch(() => {});
        setImgModal({ visible: true, uri, title, sub });
    };

    const renderTimelineItem = ({ item }: { item: TimelineItem }) => {
        if (item.type === "proof") {
            const p = item.proof;
            const raw = getRawUrl(p);
            const thumb = toAbsoluteUrl(raw || p.imageUrl); // ✅ 유저 썸네일도 raw 우선
            const title = proofTitle(p.menu?.name, p.createdAt);
            const label = proofStatusLabel(p.aiResult, p.isProcessing);
            const correctionBadge = correctionBadgeText(p);

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

                        {!!correctionBadge && (
                            <View style={{ flexDirection: "row", marginTop: 6 }}>
                                <View
                                    style={{
                                        paddingHorizontal: 8,
                                        paddingVertical: 4,
                                        borderRadius: 999,
                                        backgroundColor: "#FFF7ED",
                                        borderWidth: 1,
                                        borderColor: "#FED7AA",
                                    }}
                                >
                                    <Text style={{ fontSize: 11, color: "#9A3412", fontWeight: "900" }}>
                                        {correctionBadge}
                                    </Text>
                                </View>
                            </View>
                        )}

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
        const correction = parseCorrectionLedger(l);
        const proofFromLedger = l.proof ?? proofs.find((p) => p.id === l.proofId) ?? null;
        const proofMenuName =
            l.proof?.session?.menu?.name ?? (proofFromLedger as ProofItem | null)?.menu?.name ?? null;
        const proofCreatedAt = proofFromLedger?.createdAt ?? null;
        const title = correction ? correctionTitle(proofMenuName, proofCreatedAt) : ledgerTitle(l);
        const subtitle = ledgerSubtitle(l);
        const source = pointSourceLabel(l.source, "");
        const accent = correction ? (l.points < 0 ? "#B42318" : "#166534") : INK;
        const accentBg = correction ? (l.points < 0 ? "#FEE4E2" : "#DCFCE7") : INK;
        const amountColor = correction ? accent : "#111827";
        const iconName = correction ? (l.points < 0 ? "return-down-back-outline" : "checkmark-done-outline") : null;

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
                        backgroundColor: accentBg,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {iconName ? (
                        <Ionicons name={iconName as any} size={22} color={accent} />
                    ) : (
                        <Text style={{ color: "#fff", fontWeight: "900" }}>P</Text>
                    )}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", flex: 1, color: "#111827" }}>
                            {title}
                        </Text>
                        <Text style={{ fontSize: 12, color: "#6B7280" }}>{fmtDate(l.createdAt)}</Text>
                    </View>

                    {!!subtitle && (
                        <Text numberOfLines={2} style={{ marginTop: 4, fontSize: 12, color: "#6B7280", fontWeight: "700" }}>
                            {subtitle}
                        </Text>
                    )}

                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                        <Text style={{ fontSize: 13, color: amountColor, fontWeight: "800" }}>
                            {ledgerPointText(l)}
                        </Text>
                        {(l.balanceAfter ?? null) !== null ? (
                            <Text style={{ fontSize: 12, color: "#6B7280" }}>
                                {source ? `${source} · ` : ""}잔액 {fmtNumber(Number(l.balanceAfter))}P
                            </Text>
                        ) : (
                            <Text style={{ fontSize: 12, color: "#6B7280" }}>{source}</Text>
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
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: SCREEN_BG }}>
            {/* ✅ 이미지 크게보기 모달 */}
            <Modal
                visible={imgModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setImgModal((p) => ({ ...p, visible: false }))}
            >
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }}>
                    <Pressable
                        onPress={async () => {
                            await Haptics.selectionAsync();
                            setImgModal((p) => ({ ...p, visible: false }));
                        }}
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
                <View
                    style={{
                        backgroundColor: CARD_BG,
                        borderRadius: 18,
                        padding: 16,
                        shadowColor: "#000",
                        shadowOpacity: 0.06,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 4 },
                    }}
                >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View>
                            <Text style={{ fontSize: 12, color: "#6B7280", fontWeight: "800" }}>보유 포인트</Text>
                            <Text style={{ fontSize: 30, fontWeight: "900", marginTop: 4, color: "#111" }}>{fmtNumber(balance)}P</Text>
                        </View>
                        <View
                            style={{
                                width: 46,
                                height: 46,
                                borderRadius: 16,
                                backgroundColor: "#111",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Ionicons name="wallet" size={22} color="#fff" />
                        </View>
                    </View>

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
                                onPress={() => refreshAll(true)}
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
            </View>

            {/* 탭 */}
            <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}>
                <Pressable
                    onPress={() => scrollToTab(0)}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: tab === 0 ? INK : CARD_BG }}
                >
                    <Text style={{ textAlign: "center", color: tab === 0 ? "#FFFFFF" : "#111827", fontWeight: "700" }}>사용</Text>
                </Pressable>

                <Pressable
                    onPress={() => scrollToTab(1)}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: tab === 1 ? INK : CARD_BG }}
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
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                        <View style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#F1E8E0" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <View
                                    style={{
                                        width: 38,
                                        height: 38,
                                        borderRadius: 14,
                                        backgroundColor: "#FFF1EE",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <Ionicons name="gift-outline" size={20} color="#FF4D2D" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: "900", color: "#111" }}>포인트 사용</Text>
                                    <Text style={{ marginTop: 4, color: "#6B7280", lineHeight: 18 }}>
                                        구매 요청 후 관리자가 확인해 모바일교환권을 발송합니다.
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={{ height: 12 }} />

                        {shopItems.length ? (
                            shopItems.map((item) => {
                                const canBuy = balance >= item.pricePoints && item.stock !== 0;
                                const busy = purchasingId === item.id;
                                return (
                                    <View
                                        key={item.id}
                                        style={{
                                            backgroundColor: CARD_BG,
                                            borderRadius: 18,
                                            padding: 14,
                                            borderWidth: 1,
                                            borderColor: "#F1E8E0",
                                            marginBottom: 10,
                                            flexDirection: "row",
                                            gap: 12,
                                            alignItems: "center",
                                        }}
                                    >
                                        <View
                                            style={{
                                                width: 54,
                                                height: 54,
                                                borderRadius: 16,
                                                backgroundColor: "#F3F4F6",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {item.imageUrl ? (
                                                <Image source={{ uri: toAbsoluteUrl(item.imageUrl) }} style={{ width: 54, height: 54 }} />
                                            ) : (
                                                <Ionicons name="ticket-outline" size={24} color="#111827" />
                                            )}
                                        </View>

                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "900", color: "#111827" }}>
                                                {item.name}
                                            </Text>
                                            {!!item.description && (
                                                <Text numberOfLines={2} style={{ marginTop: 4, fontSize: 12, color: "#6B7280", lineHeight: 17 }}>
                                                    {item.description}
                                                </Text>
                                            )}
                                            <Text style={{ marginTop: 6, fontSize: 13, fontWeight: "900", color: "#111827" }}>
                                                {fmtNumber(item.pricePoints)}P
                                                {item.stock != null ? ` · 남은 수량 ${item.stock}` : ""}
                                            </Text>
                                        </View>

                                        <Pressable
                                            onPress={() => purchaseShopItem(item)}
                                            disabled={!canBuy || busy}
                                            style={{
                                                paddingVertical: 10,
                                                paddingHorizontal: 12,
                                                borderRadius: 12,
                                                backgroundColor: canBuy ? INK : "#E5E7EB",
                                                minWidth: 70,
                                                alignItems: "center",
                                            }}
                                        >
                                            <Text style={{ color: canBuy ? "#fff" : "#6B7280", fontWeight: "900", fontSize: 12 }}>
                                                {busy ? "처리중" : canBuy ? "구매" : item.stock === 0 ? "품절" : "부족"}
                                            </Text>
                                        </Pressable>
                                    </View>
                                );
                            })
                        ) : (
                            <View style={{ paddingVertical: 34, alignItems: "center" }}>
                                <Text style={{ color: "#6B7280", fontWeight: "700" }}>구매 가능한 상품이 아직 없어요.</Text>
                            </View>
                        )}

                        {!!purchases.length && (
                            <View style={{ marginTop: 4, backgroundColor: CARD_BG, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#F1E8E0" }}>
                                <Text style={{ fontSize: 14, fontWeight: "900", color: "#111827" }}>최근 구매 요청</Text>
                                <View style={{ height: 8 }} />
                                {purchases.map((p) => {
                                    const name = p.shopItem?.name ?? p.itemSnapshot?.name ?? "상품";
                                    const status =
                                        p.status === "SENT" ? "발송 완료" : p.status === "CANCELLED" ? "취소됨" : "발송 대기";
                                    return (
                                        <View key={p.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: "#F3F4F6" }}>
                                            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                                                <Text numberOfLines={1} style={{ flex: 1, fontWeight: "800", color: "#111827" }}>
                                                    {name}
                                                </Text>
                                                <Text style={{ fontSize: 12, color: "#6B7280" }}>{fmtShortDate(p.createdAt)}</Text>
                                            </View>
                                            <Text style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                                                {status} · -{fmtNumber(p.points)}P
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </ScrollView>
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
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refreshAll(true)} />}
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
