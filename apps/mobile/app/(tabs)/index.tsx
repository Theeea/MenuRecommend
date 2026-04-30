import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { fetchRecommendQuota, watchAdQuota, RecommendQuota } from "../../src/api/points";
import { fetchProofQuota, ProofQuota } from "../../src/api/proofQuota";
import { API_BASE_URL } from "../../src/config";
import { RECOMMEND_CUISINE_OPTIONS, cuisineLabel, dishTypeLabel } from "@menu-reward/shared";

type RecommendOk = {
    ok: true;
    mode: string;
    session: {
        id: string;
        status: "RECOMMENDED" | "ACCEPTED" | "DONE";
        createdAt: string;
        challengeCode?: string | null;
    };
    menu: {
        id: string;
        name: string;
        cuisine: string;
        dishType?: string | null;
    };
    warnings: any[];
};

type RecommendFail = { ok: false; message: string };

function msToKoreanRemain(ms: number) {
    if (ms <= 0) return "0분";
    const totalMin = Math.ceil(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m}분`;
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
}

export default function Home() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [quota, setQuota] = useState<RecommendQuota | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [rec, setRec] = useState<RecommendOk | null>(null);
    const [selectedCuisine, setSelectedCuisine] = useState("");
    const selectedCuisineLabel = useMemo(() => cuisineLabel(selectedCuisine), [selectedCuisine]);

    // ✅ 인증 가능 여부(쿨타임/일일 제한)
    const [proofQuota, setProofQuota] = useState<ProofQuota | null>(null);
    const [tick, setTick] = useState(0); // 남은시간 표시용

    // 광고(예정) 모달
    const [adModalOpen, setAdModalOpen] = useState(false);

    const canShowAdButton = useMemo(() => {
        if (!quota) return false;
        return quota.remaining <= 0 && quota.adGranted === false;
    }, [quota]);

    const loadQuota = useCallback(async () => {
        const q = await fetchRecommendQuota();
        setQuota(q);
    }, []);

    const refreshProof = useCallback(async () => {
        try {
            const q = await fetchProofQuota();
            setProofQuota(q);
        } catch {
            // proofQuota 못 가져와도 홈은 돌아가야 하니 조용히 무시
        }
    }, []);

    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadQuota();
            await refreshProof();
        } catch {
            Alert.alert("동기화 실패", `API 연결을 확인해줘.\n\nAPI_BASE_URL: ${API_BASE_URL}`);
        } finally {
            setRefreshing(false);
        }
    }, [loadQuota, refreshProof]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    // ✅ ACCEPTED 상태면 proofQuota 주기적으로 갱신/카운트다운 표시
    useEffect(() => {
        if (rec?.session.status === "ACCEPTED") {
            refreshProof();
            const t = setInterval(() => setTick((x) => x + 1), 1000);
            return () => clearInterval(t);
        } else {
            setProofQuota(null);
        }
    }, [rec?.session.status, refreshProof]);

    const recommend = useCallback(async () => {
        setLoading(true);
        try {
            const body = selectedCuisine ? { cuisine: selectedCuisine } : {};
            const { data } = await api.post("/recommend", body);

            if (data?.ok === true) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setRec(data as RecommendOk);
                await loadQuota();
                return;
            }

            if (data?.code === "RECOMMEND_DAILY_LIMIT") {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                setAdModalOpen(true);
                return;
            }

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const msg = (data as RecommendFail)?.message ?? "추천 요청에 실패했어요.";
            Alert.alert(
                "추천 실패",
                selectedCuisine ? `${selectedCuisineLabel} 메뉴 중에서는 ${msg}` : msg,
            );
        } catch (e: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

            const status = e?.response?.status;
            if (status === 429 && e?.response?.data?.code === "RECOMMEND_DAILY_LIMIT") {
                setAdModalOpen(true);
                try { await loadQuota(); } catch {}
                return;
            }

            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }

            Alert.alert(
                "추천 요청에 실패했어요",
                `네트워크/서버 확인 필요\n\n선택: ${selectedCuisineLabel}\nAPI_BASE_URL: ${API_BASE_URL}`,
            );
        } finally {
            setLoading(false);
        }
    }, [loadQuota, router, selectedCuisine, selectedCuisineLabel]);

    const accept = useCallback(async () => {
        if (!rec) return;
        try {
            await Haptics.selectionAsync();
            const { data } = await api.post(`/recommend/${rec.session.id}/accept`);
            setRec((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    session: {
                        ...prev.session,
                        status: "ACCEPTED",
                        challengeCode: data?.challengeCode ?? prev.session.challengeCode,
                    },
                };
            });
            await refreshProof();
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }
            Alert.alert("확정 실패", "다시 시도해줘.");
        }
    }, [rec, router, refreshProof]);

    const blockMenu = useCallback(async () => {
        if (!rec) return;

        try {
            await Haptics.selectionAsync();

            try {
                await api.post(`/me/blocked-menus/${rec.menu.id}`);
            } catch (e: any) {
                const st = e?.response?.status;
                if (st === 404 || st === 405) {
                    await api.post("/me/blocked-menus", { menuId: rec.menu.id });
                } else {
                    throw e;
                }
            }

            setRec(null);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await recommend();
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }
            Alert.alert("실패", "잠시 후 다시 시도해줘.");
        }
    }, [rec, recommend, router]);

    const goProof = useCallback(async () => {
        if (!rec) return;

        // ✅ 들어가기 전에 한번 더 체크(버튼 잠금이 있어도 안전하게)
        await refreshProof();
        if (proofQuota && !proofQuota.canVerify) {
            const next = proofQuota.nextAvailableAt ? new Date(proofQuota.nextAvailableAt).getTime() : null;
            const remain = next ? msToKoreanRemain(next - Date.now()) : "";
            const msg =
                proofQuota.code === "VERIFY_DAILY_LIMIT"
                    ? `오늘 인증 가능 횟수를 다 썼어.\n내일 다시 가능해.`
                    : `쿨타임이 남아있어.\n약 ${remain} 후 다시 시도해줘.`;
            Alert.alert("아직 인증 불가", msg);
            return;
        }

        const sessionId = rec.session.id;
        const challengeCode = rec.session.challengeCode ?? "";
        router.push({
            pathname: "/proof",
            params: { sessionId, challengeCode, menuName: rec.menu.name },
        });
    }, [rec, router, proofQuota, refreshProof]);

    const verifyButtonState = useMemo(() => {
        if (!rec || rec.session.status !== "ACCEPTED") return { disabled: false, helper: "" };
        if (!proofQuota) return { disabled: false, helper: "" };

        if (proofQuota.canVerify) return { disabled: false, helper: "" };

        if (proofQuota.code === "VERIFY_DAILY_LIMIT") {
            return {
                disabled: true,
                helper: `오늘 인증 0회 남음 · 내일 가능`,
            };
        }

        if (proofQuota.code === "VERIFY_COOLDOWN" && proofQuota.nextAvailableAt) {
            const next = new Date(proofQuota.nextAvailableAt).getTime();
            const now = Date.now() + tick * 0;
            const remainMs = next - now;
            return {
                disabled: true,
                helper: `쿨타임 남음 · ${msToKoreanRemain(remainMs)} 후 가능`,
            };
        }

        return { disabled: true, helper: "잠시 후 다시 시도해줘" };
    }, [rec, proofQuota, tick]);

    const watchAd = useCallback(async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const q = await watchAdQuota();
            setQuota(q);
            setAdModalOpen(false);
            Alert.alert("보너스 지급", "오늘 추가 5회가 열렸어!");
        } catch {
            Alert.alert("실패", "보너스 지급에 실패했어.");
        }
    }, []);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF6EE" }} edges={["top", "bottom"]}>
            <ScrollView
                style={{ flex: 1, backgroundColor: "#FFF6EE" }}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
            >
                {/* 상단 상태 카드 */}
                <View
                    style={{
                        backgroundColor: "#FFFFFF",
                        borderRadius: 18,
                        padding: 16,
                        shadowColor: "#000",
                        shadowOpacity: 0.06,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 4 },
                    }}
                >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>오늘 추천</Text>

                        <Pressable
                            onPress={refreshAll}
                            hitSlop={10}
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                borderRadius: 12,
                                backgroundColor: "#F7F7F7",
                            }}
                        >
                            <Ionicons name="refresh" size={16} color="#111" />
                            <Text style={{ fontWeight: "800", color: "#111" }}>동기화</Text>
                        </Pressable>
                    </View>

                    <View style={{ height: 12 }} />

                    <Text style={{ color: "#555", fontWeight: "700" }}>
                        남은 횟수:{" "}
                        <Text style={{ color: "#111", fontWeight: "900" }}>{quota ? quota.remaining : "-"}</Text>{" "}
                        <Text style={{ color: "#999" }}>
                            (무료 {quota?.freeLimit ?? "-"} / 보너스 {quota?.adBonus ?? "-"})
                        </Text>
                    </Text>

                    <View style={{ height: 12 }} />

                    {canShowAdButton ? (
                        <Pressable
                            onPress={() => setAdModalOpen(true)}
                            style={{
                                marginTop: 2,
                                paddingVertical: 12,
                                borderRadius: 14,
                                backgroundColor: "#111",
                                alignItems: "center",
                            }}
                        >
                            <Text style={{ color: "#FFF", fontWeight: "900" }}>광고 보고 +5회 받기(예정)</Text>
                        </Pressable>
                    ) : (
                        <Text style={{ color: "#888", fontWeight: "700" }}>
                            {quota?.adGranted ? "보너스는 오늘 이미 사용했어요." : "보너스는 무료 5회 소진 후 열려요."}
                        </Text>
                    )}

                    <View style={{ height: 10 }} />

                    <Pressable
                        onPress={() => router.push("/blocked")}
                        style={{
                            marginTop: 2,
                            paddingVertical: 12,
                            borderRadius: 14,
                            backgroundColor: "#F2F2F2",
                            alignItems: "center",
                        }}
                    >
                        <Text style={{ fontWeight: "900", color: "#111" }}>내가 싫어요 누른 메뉴 보기</Text>
                    </Pressable>
                </View>

                <View style={{ height: 14 }} />

                {/* 추천 카드 */}
                <View
                    style={{
                        backgroundColor: "#FFFFFF",
                        borderRadius: 18,
                        padding: 16,
                        shadowColor: "#000",
                        shadowOpacity: 0.06,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 4 },
                    }}
                >
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#111" }}>추천 메뉴</Text>
                    <View style={{ height: 10 }} />

                    <Text style={{ color: "#555", fontWeight: "800" }}>먹고 싶은 종류</Text>
                    <View style={{ height: 8 }} />
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {RECOMMEND_CUISINE_OPTIONS.map((option) => {
                            const active = selectedCuisine === option.value;
                            return (
                                <Pressable
                                    key={option.value || "ALL"}
                                    onPress={async () => {
                                        await Haptics.selectionAsync();
                                        setSelectedCuisine(option.value);
                                        if (rec?.session.status !== "ACCEPTED") {
                                            setRec(null);
                                        }
                                    }}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 9,
                                        borderRadius: 999,
                                        backgroundColor: active ? "#111" : "#F4F4F4",
                                        borderWidth: 1,
                                        borderColor: active ? "#111" : "#E7E7E7",
                                    }}
                                >
                                    <Text style={{ color: active ? "#FFF" : "#111", fontWeight: "900" }}>{option.label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={{ height: 14 }} />

                    {rec ? (
                        <>
                            <Text style={{ fontSize: 22, fontWeight: "900", color: "#111" }}>{rec.menu.name}</Text>
                            <Text style={{ marginTop: 6, color: "#666", fontWeight: "700" }}>
                                {cuisineLabel(rec.menu.cuisine)} · {dishTypeLabel(rec.menu.dishType)}
                            </Text>

                            <View style={{ height: 12 }} />

                            <View style={{ flexDirection: "row", gap: 10 }}>
                                {rec.session.status !== "ACCEPTED" ? (
                                    <Pressable
                                        onPress={blockMenu}
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            backgroundColor: "#F2F2F2",
                                            alignItems: "center",
                                        }}
                                    >
                                        <Text style={{ fontWeight: "900", color: "#111" }}>싫어요 / 다시 추천</Text>
                                    </Pressable>
                                ) : null}

                                {rec.session.status !== "ACCEPTED" ? (
                                    <Pressable
                                        onPress={accept}
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            backgroundColor: "#FF4D2D",
                                            alignItems: "center",
                                        }}
                                    >
                                        <Text style={{ fontWeight: "900", color: "#FFF" }}>이걸로 먹을게</Text>
                                    </Pressable>
                                ) : (
                                    <Pressable
                                        onPress={goProof}
                                        disabled={verifyButtonState.disabled}
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            backgroundColor: verifyButtonState.disabled ? "#E0E0E0" : "#111",
                                            alignItems: "center",
                                        }}
                                    >
                                        <Text style={{ fontWeight: "900", color: "#FFF" }}>인증하기</Text>
                                    </Pressable>
                                )}
                            </View>

                            {rec.session.status === "ACCEPTED" && verifyButtonState.helper ? (
                                <Text style={{ marginTop: 10, color: "#666", fontWeight: "800" }}>
                                    {verifyButtonState.helper}
                                </Text>
                            ) : null}

                            {rec.session.status !== "ACCEPTED" ? (
                                <>
                                    <View style={{ height: 10 }} />

                                    <Pressable
                                        onPress={recommend}
                                        disabled={loading}
                                        style={{
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            backgroundColor: "#FFF6EE",
                                            alignItems: "center",
                                            borderWidth: 1,
                                            borderColor: "#FFE0D3",
                                        }}
                                    >
                                        <Text style={{ fontWeight: "900", color: "#FF4D2D" }}>다시 추천받기</Text>
                                    </Pressable>
                                </>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <Text style={{ color: "#666", fontWeight: "700" }}>
                                {selectedCuisine ? `${selectedCuisineLabel} 메뉴 중에서 골라볼게.` : "버튼 한 번으로 오늘의 메뉴를 뽑아보자."}
                            </Text>
                            <View style={{ height: 12 }} />
                            <Pressable
                                onPress={recommend}
                                disabled={loading}
                                style={{
                                    paddingVertical: 14,
                                    borderRadius: 14,
                                    backgroundColor: "#FF4D2D",
                                    alignItems: "center",
                                }}
                            >
                                {loading ? <ActivityIndicator /> : <Text style={{ fontWeight: "900", color: "#FFF" }}>추천받기</Text>}
                            </Pressable>
                        </>
                    )}
                </View>

                {/* 광고(예정) 모달 */}
                <Modal transparent visible={adModalOpen} animationType="fade" onRequestClose={() => setAdModalOpen(false)}>
                    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 }}>
                        <View style={{ backgroundColor: "#fff", borderRadius: 18, padding: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>광고 보고 5회 더 받기(예정)</Text>
                            <Text style={{ marginTop: 8, color: "#555", fontWeight: "700" }}>
                                실제 광고 SDK는 나중에 붙이고, 지금은 개발용으로 “봤다고 처리”만 할게.
                            </Text>

                            <View style={{ height: 14 }} />

                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <Pressable
                                    onPress={() => setAdModalOpen(false)}
                                    style={{ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: "#F2F2F2", alignItems: "center" }}
                                >
                                    <Text style={{ fontWeight: "900", color: "#111" }}>닫기</Text>
                                </Pressable>

                                <Pressable
                                    onPress={watchAd}
                                    style={{ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: "#111", alignItems: "center" }}
                                >
                                    <Text style={{ fontWeight: "900", color: "#FFF" }}>봤다고 처리</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ScrollView>
        </SafeAreaView>
    );
}
