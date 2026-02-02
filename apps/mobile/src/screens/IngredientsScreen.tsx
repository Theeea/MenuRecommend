import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, FlatList, SafeAreaView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/RootNavigator";

type Ingredient = { id: string; name: string };

export default function IngredientsScreen({ navigation }: NativeStackScreenProps<AppStackParamList, "Ingredients">) {
    const [list, setList] = useState<Ingredient[]>([]);
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [q, setQ] = useState("");

    useEffect(() => {
        (async () => {
            const res = await api.get("/ingredients");
            setList(res.data);
        })();
    }, []);

    const filtered = useMemo(() => {
        const qq = q.trim();
        if (!qq) return list;
        return list.filter((x) => x.name.includes(qq));
    }, [list, q]);

    const toggle = (name: string) => setPicked((p) => ({ ...p, [name]: !p[name] }));

    const save = async () => {
        try {
            const names = Object.entries(picked)
                .filter(([, v]) => v)
                .map(([k]) => k);

            await api.put("/me/disliked-ingredients", { ingredientNames: names });
            navigation.replace("Recommend");
        } catch (e: any) {
            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "저장 실패");
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>싫어하는 재료를 선택</Text>

            <TextInput
                placeholder="검색 (예: 버섯)"
                value={q}
                onChangeText={setQ}
                style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
            />

            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                    const checked = !!picked[item.name];
                    return (
                        <TouchableOpacity onPress={() => toggle(item.name)} style={{ paddingVertical: 12 }}>
                            <Text style={{ fontSize: 16 }}>{checked ? "✅ " : "⬜️ "}{item.name}</Text>
                        </TouchableOpacity>
                    );
                }}
            />

            <Button title="저장하고 추천 보기" onPress={save} />
        </SafeAreaView>
    );
}
