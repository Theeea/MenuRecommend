import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    Pressable,
    Text,
    ToastAndroid,
    View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAuth } from "../../src/auth/authStore";
import { useIngredientsStore } from "../../src/ingredients/ingredientsStore";
import { fetchIngredients, saveUserIngredients } from "../../src/api/ingredients";

type Ingredient = {
    id: string;
    name: string;
};

function toast(msg: string) {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert("", msg);
}

export default function IngredientsScreen() {
    const router = useRouter();

    // ✅ 너희 authStore에서 token 키가 다르면 여기만 바꾸면 됨
    const { token } = useAuth();

    // ✅ getState()로 읽으면 UI가 갱신 안 될 수 있어서 "selector 구독"으로 가져옴
    const selectedIds = useIngredientsStore((s) => s.selectedIngredientIds);
    const toggle = useIngredientsStore((s) => s.toggleIngredient);
    const reset = useIngredientsStore((s) => s.reset);

    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await fetchIngredients();
            setIngredients(list);
        } catch (e: any) {
            toast(e?.message || "재료 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    }, []);

    // 화면 진입/복귀 시마다 새로 로딩 (리스트가 안 뜨는 문제 확인에도 좋음)
    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    // ✅ 절대 selectedIds로 필터링해서 data 만들지 마! (초기에 0개라 화면이 빈다)
    const data = useMemo(() => ingredients, [ingredients]);

    const onSave = async () => {
        if (!token) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            toast("로그인이 필요합니다.");
            return;
        }

        setSaving(true);
        try {
            await saveUserIngredients(token, selectedIds);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toast("저장되었습니다.");
        } catch (e: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            toast(e?.message || "저장 실패");
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: "#FFF6EE", padding: 16 }}>
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
                <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>싫어하는 재료</Text>
                <Text style={{ marginTop: 6, color: "#666", fontWeight: "700", lineHeight: 19 }}>
                    MAIN 재료로 들어간 메뉴는 추천에서 제외돼요.
                </Text>

                <View style={{ height: 14 }} />

                <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                    onPress={onSave}
                    disabled={saving}
                    style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: saving ? "#ffb3a6" : "#FF4D2D",
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 7,
                    }}
                >
                    <Ionicons name="save-outline" size={17} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                        {saving ? "저장중..." : "저장"}
                    </Text>
                </Pressable>

                <Pressable
                    onPress={async () => {
                        await Haptics.selectionAsync();
                        reset();
                    }}
                    style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        backgroundColor: "#F2F4F7",
                        alignItems: "center",
                        flexDirection: "row",
                        gap: 7,
                    }}
                >
                    <Ionicons name="refresh-outline" size={17} color="#111" />
                    <Text style={{ color: "#111", fontWeight: "700" }}>초기화</Text>
                </Pressable>
                </View>

                {/* ✅ 차단 메뉴 관리 */}
                <View style={{ height: 10 }} />
                <Pressable
                    onPress={async () => {
                        await Haptics.selectionAsync();
                        router.push("/blocked");
                    }}
                    style={{
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: "#111",
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                    }}
                >
                    <Ionicons name="ban-outline" size={17} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "800" }}>차단 메뉴 관리</Text>
                </Pressable>
            </View>

            <View style={{ height: 12 }} />

            {loading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator />
                    <View style={{ height: 8 }} />
                    <Text style={{ color: "#666" }}>재료 불러오는 중…</Text>
                </View>
            ) : (
                <FlatList
                    data={data}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    renderItem={({ item }) => {
                        const selected = selectedIds.includes(String(item.id));
                        return (
                            <Pressable
                                onPress={async () => {
                                    await Haptics.selectionAsync();
                                    toggle(String(item.id));
                                }}
                                style={{
                                    paddingVertical: 14,
                                    paddingHorizontal: 12,
                                    borderRadius: 14,
                                    marginBottom: 10,
                                    backgroundColor: selected ? "#FFF1EE" : "#FFFFFF",
                                    borderWidth: 1,
                                    borderColor: selected ? "#FF4D2D" : "#EEE",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <Text style={{ fontSize: 16, fontWeight: selected ? "800" : "700", color: "#111" }}>
                                    {item.name}
                                </Text>
                                <Ionicons
                                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                                    size={22}
                                    color={selected ? "#FF4D2D" : "#C9CDD2"}
                                />
                            </Pressable>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={{ paddingVertical: 40, alignItems: "center" }}>
                            <Text style={{ color: "#666" }}>재료 목록이 비어있습니다.</Text>
                            <View style={{ height: 8 }} />
                            <Pressable onPress={load} style={{ padding: 10 }}>
                                <Text style={{ color: "#FF4D2D", fontWeight: "700" }}>다시 불러오기</Text>
                            </Pressable>
                        </View>
                    }
                />
            )}
        </View>
    );
}
