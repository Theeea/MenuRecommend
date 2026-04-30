import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    RefreshControl,
    Text,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../src/api/client";
import { cuisineLabel, dishTypeLabel } from "../src/labels/menuLabels";

type BlockRow = {
    id: string;
    menuId: string;
    createdAt: string;
    menu?: {
        id: string;
        name: string;
        cuisine?: string | null;
        dishType?: string | null;
    } | null;
};

type ApiRes = {
    ok: boolean;
    data?: BlockRow[];
    nextCursor?: string | null;
    message?: string;
};

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function BlockedScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [items, setItems] = useState<BlockRow[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canLoadMore = useMemo(
        () => Boolean(nextCursor && !loadingMore && !refreshing),
        [nextCursor, loadingMore, refreshing]
    );

    const fetchList = useCallback(async (cursor?: string | null, append = false) => {
        const take = 30;
        const qs = new URLSearchParams();
        qs.set("take", String(take));
        if (cursor) qs.set("cursor", cursor);

        const res = await api.get<ApiRes>(`/me/blocked-menus?${qs.toString()}`);
        const data = res.data;

        if (!data?.ok) throw new Error(data?.message || "차단 목록을 불러오지 못했어요.");

        const rows = data.data ?? [];
        setNextCursor(data.nextCursor ?? null);

        if (append) setItems((prev) => [...prev, ...rows]);
        else setItems(rows);
    }, []);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            await fetchList(null, false);
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) setError("로그인이 필요해요. 다시 로그인해 주세요.");
            else setError(String(e?.message ?? e));
        } finally {
            setRefreshing(false);
        }
    }, [fetchList]);

    const loadMore = useCallback(async () => {
        if (!canLoadMore) return;
        setLoadingMore(true);
        setError(null);
        try {
            await fetchList(nextCursor, true);
        } catch (e: any) {
            setError(String(e?.message ?? e));
        } finally {
            setLoadingMore(false);
        }
    }, [canLoadMore, fetchList, nextCursor]);

    const removeOne = useCallback(async (menuId: string) => {
        Alert.alert("차단 해제", "이 메뉴 차단을 해제할까요?", [
            { text: "취소", style: "cancel" },
            {
                text: "해제",
                style: "destructive",
                onPress: async () => {
                    try {
                        await api.delete(`/me/blocked-menus/${menuId}`);
                        setItems((prev) => prev.filter((x) => x.menuId !== menuId));
                    } catch (e: any) {
                        Alert.alert("실패", e?.response?.data?.message || e?.message || "삭제에 실패했어요.");
                    }
                },
            },
        ]);
    }, []);

    const resetAll = useCallback(async () => {
        Alert.alert("전체 초기화", "차단 목록을 전부 초기화할까요?", [
            { text: "취소", style: "cancel" },
            {
                text: "초기화",
                style: "destructive",
                onPress: async () => {
                    try {
                        await api.delete(`/me/blocked-menus`);
                        setItems([]);
                        setNextCursor(null);
                    } catch (e: any) {
                        Alert.alert("실패", e?.response?.data?.message || e?.message || "초기화에 실패했어요.");
                    }
                },
            },
        ]);
    }, []);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            refresh().finally(() => setLoading(false));
        }, [refresh])
    );

    const renderItem = ({ item }: { item: BlockRow }) => {
        const name = item.menu?.name ?? "(알 수 없는 메뉴)";
        const meta = [cuisineLabel(item.menu?.cuisine, ""), dishTypeLabel(item.menu?.dishType, "")]
            .filter(Boolean)
            .join(" · ");

        return (
            <View
                style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderBottomWidth: 1,
                    borderColor: "#EFEFEF",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                }}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "900", color: "#111827" }}>
                        {name}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                        {meta ? `${meta} · ` : ""}
                        {fmtDate(item.createdAt)}
                    </Text>
                </View>

                <Pressable
                    onPress={() => removeOne(item.menuId)}
                    style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        backgroundColor: "#111827",
                    }}
                >
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>해제</Text>
                </Pressable>
            </View>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF6EE" }} edges={["top", "bottom"]}>
            <View style={{ flex: 1, paddingTop: 10, paddingHorizontal: 16 }}>
                <View
                    style={{
                        backgroundColor: "#fff",
                        borderRadius: 18,
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>차단 메뉴</Text>
                        <Text style={{ marginTop: 6, color: "#6B7280", fontWeight: "700" }}>
                            차단한 메뉴는 추천에서 제외돼요.
                        </Text>
                    </View>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                            onPress={resetAll}
                            style={{
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 12,
                                backgroundColor: "#FEE2E2",
                            }}
                        >
                            <Text style={{ color: "#B42318", fontWeight: "900", fontSize: 12 }}>전체 초기화</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => router.back()}
                            style={{
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 12,
                                backgroundColor: "#111",
                            }}
                        >
                            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>닫기</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={{ height: 12 }} />

                <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" }}>
                    {loading ? (
                        <View style={{ paddingTop: 26, alignItems: "center" }}>
                            <ActivityIndicator />
                        </View>
                    ) : (
                        <FlatList
                            data={items}
                            keyExtractor={(it) => it.id}
                            renderItem={renderItem}
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
                            onEndReachedThreshold={0.4}
                            onEndReached={loadMore}
                            ListEmptyComponent={
                                <View style={{ paddingTop: 40, alignItems: "center" }}>
                                    <Text style={{ color: "#6B7280", fontWeight: "800" }}>
                                        {error ? "목록을 불러오지 못했어요." : "차단한 메뉴가 없어요."}
                                    </Text>
                                </View>
                            }
                            ListFooterComponent={
                                loadingMore ? (
                                    <View style={{ paddingVertical: 14 }}>
                                        <ActivityIndicator />
                                    </View>
                                ) : (
                                    <View style={{ height: Math.max(16, insets.bottom) }} />
                                )
                            }
                        />
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}
