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
import { API_BASE_URL } from "../../src/config";

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

export default function Home() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [quota, setQuota] = useState<RecommendQuota | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [rec, setRec] = useState<RecommendOk | null>(null);

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

    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadQuota();
        } catch (e: any) {
            Alert.alert(
                "동기화 실패",
                `API 연결을 확인해줘.\n\nAPI_BASE_URL: ${API_BASE_URL}`
            );
        } finally {
            setRefreshing(false);
        }
    }, [loadQuota]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    const recommend = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.post("/recommend", {});

            // 1) 정상 추천
            if (data?.ok === true) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setRec(data as RecommendOk);
                await loadQuota(); // ✅ 추천 성공했으면 quota 갱신
                return;
            }

            // 2) (만약 서버가 200으로 내려주는 형태라면) 일일 제한
            if (data?.code === "RECOMMEND_DAILY_LIMIT") {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                setAdModalOpen(true);
                return;
            }

            // 3) 기타 실패
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const msg = (data as RecommendFail)?.message ?? "추천 요청에 실패했어요.";
            Alert.alert("추천 실패", msg);
        } catch (e: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

            const status = e?.response?.status;

            // ✅ 429면 모달 띄우기
            if (status === 429 && e?.response?.data?.code === "RECOMMEND_DAILY_LIMIT") {
                setAdModalOpen(true);
                try {
                    await loadQuota();
                } catch {}
                return;
            }

            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }

            Alert.alert(
                "추천 요청에 실패했어요",
                `네트워크/서버 확인 필요\n\nAPI_BASE_URL: ${API_BASE_URL}`
            );
        } finally {
            setLoading(false);
        }
    }, [loadQuota, router]);

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
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }
            Alert.alert("확정 실패", "다시 시도해줘.");
        }
    }, [rec, router]);

    const blockMenu = useCallback(async () => {
        if (!rec) return;

        try {
            await Haptics.selectionAsync();

            // ✅ 1) /me/blocked-menus/:menuId (내가 최근에 준 서버 코드 방식)
            try {
                await api.post(`/me/blocked-menus/${rec.menu.id}`);
            } catch (e: any) {
                // ✅ 2) fallback: /me/blocked-menus {menuId} (현재 네 index.tsx가 쓰던 방식)
                const st = e?.response?.status;
                if (st === 404 || st === 405) {
                    await api.post("/me/blocked-menus", { menuId: rec.menu.id });
                } else {
                    throw e;
                }
            }

            Alert.alert("처리 완료", "이 메뉴는 앞으로 추천에서 제외할게.");
            setRec(null);
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }
            Alert.alert("실패", "잠시 후 다시 시도해줘.");
        }
    }, [rec, router]);

    const goProof = useCallback(() => {
        if (!rec) return;
        const sessionId = rec.session.id;
        const challengeCode = rec.session.challengeCode ?? "";
        router.push({
            pathname: "/proof",
            params: {
                sessionId,
                challengeCode,
                menuName: rec.menu.name,
            },
        });
    }, [rec, router]);

    const watchAd = useCallback(async () => {
        try {
            // ✅ 실제 광고 SDK는 나중에 붙이고, 지금은 “봤다고 처리”로 서버 쿼터만 지급
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const q = await watchAdQuota();
            setQuota(q);
            setAdModalOpen(false);
            Alert.alert("보너스 지급", "오늘 추가 5회가 열렸어!");
        } catch (e: any) {
            Alert.alert("실패", "보너스 지급에 실패했어.");
        }
    }, []);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF6EE" }} edges={["top", "bottom"]}>
            <ScrollView
                style={{ flex: 1, backgroundColor: "#FFF6EE" }}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={{
                    padding: 16,
                    paddingBottom: 16 + insets.bottom,
                }}
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
                        <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>
                            오늘 추천
                        </Text>

                        {/* ✅ 새로고침(동기화) 버튼 유지 */}
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
                        <Text style={{ color: "#111", fontWeight: "900" }}>
                            {quota ? quota.remaining : "-"}
                        </Text>
                        {"  "}
                        <Text style={{ color: "#999" }}>
                            (무료 {quota?.freeLimit ?? "-"} / 보너스 {quota?.adBonus ?? "-"})
                        </Text>
                    </Text>

                    <View style={{ height: 12 }} />

                    {/* ✅ 광고 보기 버튼 */}
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
                            <Text style={{ color: "#FFF", fontWeight: "900" }}>
                                광고 보고 +5회 받기(예정)
                            </Text>
                        </Pressable>
                    ) : (
                        <Text style={{ color: "#888", fontWeight: "700" }}>
                            {quota?.adGranted
                                ? "보너스는 오늘 이미 사용했어요."
                                : "보너스는 무료 5회 소진 후 열려요."}
                        </Text>
                    )}

                    <View style={{ height: 10 }} />

                    {/* ✅ 싫어요 목록 관리 페이지 이동(있으면 편해서 유지) */}
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
                        <Text style={{ fontWeight: "900", color: "#111" }}>
                            내가 싫어요 누른 메뉴 보기
                        </Text>
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
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#111" }}>
                        추천 메뉴
                    </Text>

                    <View style={{ height: 10 }} />

                    {rec ? (
                        <>
                            <Text style={{ fontSize: 22, fontWeight: "900", color: "#111" }}>
                                {rec.menu.name}
                            </Text>
                            <Text style={{ marginTop: 6, color: "#666", fontWeight: "700" }}>
                                {rec.menu.cuisine} · {rec.menu.dishType ?? "기타"}
                            </Text>

                            <View style={{ height: 12 }} />

                            <View style={{ flexDirection: "row", gap: 10 }}>
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
                                    <Text style={{ fontWeight: "900", color: "#111" }}>
                                        싫어요
                                    </Text>
                                </Pressable>

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
                                        <Text style={{ fontWeight: "900", color: "#FFF" }}>
                                            이걸로 먹을게
                                        </Text>
                                    </Pressable>
                                ) : (
                                    <Pressable
                                        onPress={goProof}
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            backgroundColor: "#111",
                                            alignItems: "center",
                                        }}
                                    >
                                        <Text style={{ fontWeight: "900", color: "#FFF" }}>
                                            인증하기
                                        </Text>
                                    </Pressable>
                                )}
                            </View>

                            <View style={{ height: 10 }} />

                            {/* ✅ 다시 추천받기 유지 */}
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
                                <Text style={{ fontWeight: "900", color: "#FF4D2D" }}>
                                    다시 추천받기
                                </Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <Text style={{ color: "#666", fontWeight: "700" }}>
                                버튼 한 번으로 오늘의 메뉴를 뽑아보자.
                            </Text>

                            <View style={{ height: 12 }} />

                            {/* ✅ 추천받기 버튼 유지 */}
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
                                {loading ? (
                                    <ActivityIndicator />
                                ) : (
                                    <Text style={{ fontWeight: "900", color: "#FFF" }}>
                                        추천받기
                                    </Text>
                                )}
                            </Pressable>
                        </>
                    )}
                </View>

                {/* 광고(예정) 모달 */}
                <Modal transparent visible={adModalOpen} animationType="fade" onRequestClose={() => setAdModalOpen(false)}>
                    <View
                        style={{
                            flex: 1,
                            backgroundColor: "rgba(0,0,0,0.45)",
                            justifyContent: "center",
                            padding: 18,
                        }}
                    >
                        <View
                            style={{
                                backgroundColor: "#fff",
                                borderRadius: 18,
                                padding: 16,
                            }}
                        >
                            <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>
                                광고 보고 5회 더 받기(예정)
                            </Text>
                            <Text style={{ marginTop: 8, color: "#555", fontWeight: "700" }}>
                                실제 광고 SDK는 나중에 붙이고,
                                지금은 개발용으로 “봤다고 처리”만 할게.
                            </Text>

                            <View style={{ height: 14 }} />

                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <Pressable
                                    onPress={() => setAdModalOpen(false)}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 12,
                                        borderRadius: 14,
                                        backgroundColor: "#F2F2F2",
                                        alignItems: "center",
                                    }}
                                >
                                    <Text style={{ fontWeight: "900", color: "#111" }}>닫기</Text>
                                </Pressable>

                                <Pressable
                                    onPress={watchAd}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 12,
                                        borderRadius: 14,
                                        backgroundColor: "#111",
                                        alignItems: "center",
                                    }}
                                >
                                    <Text style={{ fontWeight: "900", color: "#FFF" }}>
                                        봤다고 처리
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ScrollView>
        </SafeAreaView>
    );
}
