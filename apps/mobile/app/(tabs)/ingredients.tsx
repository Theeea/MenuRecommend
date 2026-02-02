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
            toast("로그인이 필요합니다.");
            return;
        }

        setSaving(true);
        try {
            await saveUserIngredients(token, selectedIds);
            toast("저장되었습니다.");
        } catch (e: any) {
            toast(e?.message || "저장 실패");
        } finally {
            setSaving(false);
        }
    };

    // 디버그(원인확정): 0이면 API/파싱 문제, 0이 아니면 렌더/필터 문제
    console.log("[ingredients] ingredients len =", ingredients?.length);
    console.log("[ingredients] selected len =", selectedIds?.length);

    return (
        <View style={{ flex: 1, backgroundColor: "#fff", padding: 16 }}>
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
                    }}
                >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                        {saving ? "저장중..." : "저장"}
                    </Text>
                </Pressable>

                <Pressable
                    onPress={reset}
                    style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        backgroundColor: "#F2F4F7",
                        alignItems: "center",
                    }}
                >
                    <Text style={{ color: "#111", fontWeight: "700" }}>초기화</Text>
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
                                onPress={() => toggle(String(item.id))}
                                style={{
                                    paddingVertical: 14,
                                    paddingHorizontal: 12,
                                    borderRadius: 12,
                                    marginBottom: 10,
                                    backgroundColor: selected ? "#FFF1EE" : "#FAFAFA",
                                    borderWidth: 1,
                                    borderColor: selected ? "#FF4D2D" : "#EEE",
                                }}
                            >
                                <Text style={{ fontSize: 16, fontWeight: selected ? "700" : "500" }}>
                                    {selected ? "✅ " : "⬜️ "}
                                    {item.name}
                                </Text>
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
