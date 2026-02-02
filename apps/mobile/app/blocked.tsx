import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    SafeAreaView,
    Text,
    View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { api } from "../src/api/client";
import { PressScaleButton } from "../src/ui/PressScaleButton";

type Item = {
    id: string; // block id
    createdAt: string;
    menu: { id: string; name: string; cuisine: string; dishType?: string | null };
};

export default function BlockedMenusPage() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<Item[]>([]);
    const [busyMenuId, setBusyMenuId] = useState<string | null>(null);
    const [clearing, setClearing] = useState(false);

    const count = items.length;

    const load = async () => {
        try {
            setLoading(true);
            const res = await api.get("/me/blocked-menus");
            const list = res.data?.items ?? [];
            setItems(list);
        } catch (e: any) {
            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "목록을 불러오지 못했어요.");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        Haptics.selectionAsync().catch(() => {});
        load();
    }, []);

    const removeOne = async (menuId: string) => {
        try {
            setBusyMenuId(menuId);
            await api.delete(`/me/blocked-menus/${menuId}`);
            Haptics.selectionAsync().catch(() => {});
            setItems((prev) => prev.filter((it) => it.menu.id !== menuId));
        } catch (e: any) {
            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "해제 실패");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        } finally {
            setBusyMenuId(null);
        }
    };

    const clearAll = async () => {
        Alert.alert(
            "전체 초기화",
            "추천 제외 목록을 모두 해제할까요?",
            [
                { text: "취소", style: "cancel" },
                {
                    text: "초기화",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setClearing(true);
                            await api.delete("/me/blocked-menus");
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                            setItems([]);
                        } catch (e: any) {
                            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "초기화 실패");
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                        } finally {
                            setClearing(false);
                        }
                    },
                },
            ],
            { cancelable: true },
        );
    };

    const header = useMemo(() => {
        return (
            <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Pressable
                        onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            router.back();
                        }}
                    >
                        <Text style={{ fontWeight: "900" }}>← 뒤로</Text>
                    </Pressable>

                    <Pressable
                        onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            load();
                        }}
                    >
                        <Text style={{ fontWeight: "900" }}>새로고침</Text>
                    </Pressable>
                </View>

                <Text style={{ fontSize: 24, fontWeight: "900" }}>추천 제외 목록</Text>
                <Text style={{ opacity: 0.7 }}>
                    다시 추천받고 싶은 메뉴는 ‘해제’를 눌러주세요.
                </Text>

                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Text style={{ fontWeight: "900" }}>총 {count}개</Text>
                    <View style={{ flex: 1 }} />
                    <PressScaleButton
                        title={clearing ? "초기화 중..." : "전체 초기화"}
                        variant="danger"
                        disabled={clearing || count === 0}
                        onPress={clearAll}
                        style={{ paddingVertical: 12 }}
                    />
                </View>

                <View style={{ height: 1, backgroundColor: "#e5e5e5" }} />
            </View>
        );
    }, [count, clearing]);

    return (
        <SafeAreaView style={{ flex: 1, padding: 16 }}>
            {loading ? (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 10 }}>
                    <ActivityIndicator />
                    <Text style={{ opacity: 0.7 }}>불러오는 중…</Text>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(it) => it.menu.id}
                    ListHeaderComponent={header}
                    ListEmptyComponent={
                        <View style={{ paddingVertical: 30, gap: 8 }}>
                            <Text style={{ fontWeight: "900" }}>비어 있어요.</Text>
                            <Text style={{ opacity: 0.7 }}>
                                ‘이 메뉴는 다시 추천 안 하기’를 누른 메뉴가 여기에 쌓여요.
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const menu = item.menu;
                        const busy = busyMenuId === menu.id;

                        return (
                            <View
                                style={{
                                    paddingVertical: 14,
                                    borderBottomWidth: 1,
                                    borderBottomColor: "#eee",
                                    gap: 8,
                                }}
                            >
                                <Text style={{ fontSize: 18, fontWeight: "900" }}>{menu.name}</Text>
                                <Text style={{ opacity: 0.7 }}>
                                    {menu.cuisine} {menu.dishType ?? ""}
                                </Text>

                                <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                                    <View style={{ flex: 1 }} />
                                    <PressScaleButton
                                        title={busy ? "해제 중..." : "해제"}
                                        variant="secondary"
                                        disabled={busy || clearing}
                                        onPress={() => removeOne(menu.id)}
                                        style={{ paddingVertical: 10, paddingHorizontal: 14 }}
                                    />
                                </View>
                            </View>
                        );
                    }}
                />
            )}
        </SafeAreaView>
    );
}
