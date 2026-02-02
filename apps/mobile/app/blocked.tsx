import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { api } from "../src/api/client";

type Row = {
    id: string;
    menuId: string;
    createdAt: string;
    menu?: { id: string; name?: string; title?: string; cuisine?: string; dishType?: string | null };
};

export default function BlockedPage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get("/me/blocked-menus");
            const body = res.data;

            // ✅ 응답 형태 전부 대응
            const list: any[] =
                Array.isArray(body) ? body :
                    Array.isArray(body?.data) ? body.data :
                        Array.isArray(body?.items) ? body.items :
                            Array.isArray(body?.blockedMenus) ? body.blockedMenus :
                                [];

            setRows(list);
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }
            Alert.alert("불러오기 실패", e?.response?.data?.message ?? e?.message ?? "잠시 후 다시 시도해줘.");
        } finally {
            setLoading(false);
        }
    }, [router]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const removeOne = useCallback(
        (menuId: string) => {
            Alert.alert("삭제", "이 메뉴를 싫어요 목록에서 삭제할까요?", [
                { text: "취소", style: "cancel" },
                {
                    text: "삭제",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await Haptics.selectionAsync();
                            await api.delete(`/me/blocked-menus/${menuId}`);
                            setRows((prev) => prev.filter((r) => r.menuId !== menuId));
                        } catch (e: any) {
                            Alert.alert("삭제 실패", e?.response?.data?.message ?? e?.message ?? "잠시 후 다시 시도해줘.");
                        }
                    },
                },
            ]);
        },
        []
    );

    const resetAll = useCallback(() => {
        Alert.alert("전체 초기화", "싫어요 목록을 전부 삭제할까요?", [
            { text: "취소", style: "cancel" },
            {
                text: "초기화",
                style: "destructive",
                onPress: async () => {
                    try {
                        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        await api.delete("/me/blocked-menus");
                        setRows([]);
                    } catch (e: any) {
                        Alert.alert("초기화 실패", e?.response?.data?.message ?? e?.message ?? "잠시 후 다시 시도해줘.");
                    }
                },
            },
        ]);
    }, []);

    return (
        <>
            {/* ✅ 여기서도 (tabs) 헤더 뜨면 제거 */}
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF6EE" }} edges={["top", "bottom"]}>
                <View style={{ flex: 1, padding: 16, paddingBottom: 16 + insets.bottom }}>
                    <View
                        style={{
                            backgroundColor: "#fff",
                            borderRadius: 18,
                            padding: 16,
                            shadowColor: "#000",
                            shadowOpacity: 0.06,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 4 },
                        }}
                    >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Pressable onPress={() => router.back()} hitSlop={10}>
                                    <Ionicons name="chevron-back" size={22} color="#111" />
                                </Pressable>
                                <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>
                                    싫어요 목록
                                </Text>
                            </View>

                            <Pressable
                                onPress={resetAll}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    borderRadius: 12,
                                    backgroundColor: "#111",
                                }}
                            >
                                <Text style={{ color: "#fff", fontWeight: "900" }}>전체 초기화</Text>
                            </Pressable>
                        </View>

                        <Text style={{ marginTop: 8, color: "#666", fontWeight: "700" }}>
                            {loading ? "불러오는 중..." : `현재 ${rows.length}개`}
                        </Text>
                    </View>

                    <View style={{ height: 14 }} />

                    <FlatList
                        data={rows}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ paddingBottom: 30 }}
                        ListEmptyComponent={
                            <View
                                style={{
                                    backgroundColor: "#fff",
                                    borderRadius: 18,
                                    padding: 16,
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{ color: "#666", fontWeight: "800" }}>
                                    싫어요 누른 메뉴가 없습니다.
                                </Text>
                            </View>
                        }
                        renderItem={({ item }) => {
                            const name = item.menu?.name ?? item.menu?.title ?? item.menuId;

                            return (
                                <View
                                    style={{
                                        backgroundColor: "#fff",
                                        borderRadius: 18,
                                        padding: 16,
                                        marginBottom: 10,
                                        shadowColor: "#000",
                                        shadowOpacity: 0.04,
                                        shadowRadius: 10,
                                        shadowOffset: { width: 0, height: 4 },
                                    }}
                                >
                                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#111" }}>
                                        {name}
                                    </Text>
                                    <Text style={{ marginTop: 6, color: "#666", fontWeight: "700" }}>
                                        {new Date(item.createdAt).toLocaleString()}
                                    </Text>

                                    <View style={{ height: 12 }} />

                                    <Pressable
                                        onPress={() => removeOne(item.menuId)}
                                        style={{
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            backgroundColor: "#F2F2F2",
                                            alignItems: "center",
                                            flexDirection: "row",
                                            justifyContent: "center",
                                            gap: 6,
                                        }}
                                    >
                                        <Ionicons name="trash" size={16} color="#111" />
                                        <Text style={{ fontWeight: "900", color: "#111" }}>목록에서 삭제</Text>
                                    </Pressable>
                                </View>
                            );
                        }}
                    />
                </View>
            </SafeAreaView>
        </>
    );
}
