import React, { useState } from "react";
import { Alert, Button, SafeAreaView, Text, View } from "react-native";
import { api } from "../api/client";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../auth/authStore";

export default function RecommendScreen({ navigation }: NativeStackScreenProps<AppStackParamList, "Recommend">) {
    const { signOut } = useAuth();
    const [data, setData] = useState<any>(null);

    const recommend = async () => {
        try {
            const res = await api.post("/recommend", { avoidRecentHours: 0 });
            setData(res.data);
        } catch (e: any) {
            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "추천 실패");
        }
    };

    const accept = async () => {
        try {
            const sessionId = data?.session?.id;
            if (!sessionId) return;

            await api.post(`/recommend/${sessionId}/accept`);
            navigation.navigate("Proof", { sessionId });
        } catch (e: any) {
            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "수락 실패");
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
            <Button title="로그아웃" onPress={signOut} />

            <Button title="추천 받기" onPress={recommend} />

            {data?.ok && (
                <View style={{ padding: 16, borderWidth: 1, borderRadius: 12, gap: 8 }}>
                    <Text style={{ fontSize: 20, fontWeight: "700" }}>{data.menu.name}</Text>
                    <Text>{data.menu.cuisine} {data.menu.dishType ?? ""}</Text>

                    {Array.isArray(data.warnings) && data.warnings.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                            <Text style={{ fontWeight: "700" }}>주의 재료</Text>
                            {data.warnings.map((w: any, idx: number) => (
                                <Text key={idx}>- {w.ingredientName} ({w.role}, removable: {w.removable})</Text>
                            ))}
                        </View>
                    )}

                    <Button title="이걸로 먹을게(수락)" onPress={accept} />
                </View>
            )}
        </SafeAreaView>
    );
}
