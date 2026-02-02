import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/authStore";
import { Link } from "expo-router";

export default function RegisterScreen() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const onRegister = async () => {
        try {
            setLoading(true);
            Haptics.selectionAsync();
            const res = await api.post("/auth/register", { email, password });
            await signIn(res.data.accessToken);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e: any) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("회원가입 실패", e?.response?.data?.message ?? "다시 시도해줘.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F9FF" }} edges={["top", "left", "right"]}>
            <View style={{ flex: 1, padding: 20, gap: 14 }}>
                <View style={{ marginTop: 10, gap: 6 }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: "#111" }}>회원가입</Text>
                    <Text style={{ color: "#444", lineHeight: 20 }}>
                        계정 만들고 포인트 적립 시작!
                    </Text>
                </View>

                <View style={{ marginTop: 18, backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 12 }}>
                    <View>
                        <Text style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>이메일</Text>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            placeholder="test@example.com"
                            style={{
                                height: 46,
                                paddingHorizontal: 12,
                                borderRadius: 12,
                                backgroundColor: "#F6F6F6",
                            }}
                        />
                    </View>

                    <View>
                        <Text style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>비밀번호</Text>
                        <TextInput
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            placeholder="••••"
                            style={{
                                height: 46,
                                paddingHorizontal: 12,
                                borderRadius: 12,
                                backgroundColor: "#F6F6F6",
                            }}
                        />
                    </View>

                    <Pressable
                        onPress={onRegister}
                        disabled={loading || !email || password.length < 4}
                        style={{
                            height: 52,
                            borderRadius: 14,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#111",
                            opacity: loading || !email || password.length < 4 ? 0.5 : 1,
                            marginTop: 6,
                        }}
                    >
                        <Text style={{ color: "white", fontWeight: "800", fontSize: 16 }}>
                            {loading ? "생성 중..." : "계정 만들기"}
                        </Text>
                    </Pressable>

                    <Link href="/login" asChild>
                        <Pressable style={{ alignItems: "center", paddingVertical: 10 }}>
                            <Text style={{ color: "#333", fontWeight: "700" }}>로그인으로</Text>
                        </Pressable>
                    </Link>
                </View>
            </View>
        </SafeAreaView>
    );
}
