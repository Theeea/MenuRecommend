import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/authStore";
import { Link, useRouter } from "expo-router";

export default function RegisterScreen() {
    const router = useRouter();
    const { signIn } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const canSubmit = email.trim().length > 0 && password.length >= 4 && !loading;

    const onRegister = async () => {
        if (!canSubmit) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("입력 확인", "이메일과 4자 이상 비밀번호를 입력해줘.");
            return;
        }

        try {
            setLoading(true);
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const res = await api.post("/auth/register", { email: email.trim(), password });
            await signIn(res.data.accessToken);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace("/(tabs)");
        } catch (e: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("회원가입 실패", e?.response?.data?.message ?? "다시 시도해줘.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF6EE" }} edges={["top", "left", "right"]}>
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexGrow: 1, padding: 18, justifyContent: "center" }}
            >
                <View style={{ gap: 14 }}>
                    <View
                        style={{
                            width: 54,
                            height: 54,
                            borderRadius: 18,
                            backgroundColor: "#111",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Ionicons name="sparkles" size={24} color="#fff" />
                    </View>

                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 30, fontWeight: "900", color: "#111" }}>Menu Reward</Text>
                        <Text style={{ color: "#555", lineHeight: 20, fontWeight: "700" }}>
                            메뉴 추천받고 음식 인증으로 포인트를 모아보세요.
                        </Text>
                    </View>

                    <View
                        style={{
                            marginTop: 8,
                            backgroundColor: "#fff",
                            borderRadius: 20,
                            padding: 16,
                            gap: 13,
                            shadowColor: "#000",
                            shadowOpacity: 0.06,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 4 },
                        }}
                    >
                        <View>
                            <Text style={{ fontSize: 13, color: "#666", marginBottom: 7, fontWeight: "800" }}>이메일</Text>
                            <View
                                style={{
                                    height: 50,
                                    paddingHorizontal: 12,
                                    borderRadius: 14,
                                    backgroundColor: "#F7F7F7",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 9,
                                    borderWidth: 1,
                                    borderColor: "#EFEFEF",
                                }}
                            >
                                <Ionicons name="mail-outline" size={18} color="#777" />
                                <TextInput
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="email-address"
                                    placeholder="test@example.com"
                                    style={{ flex: 1, fontWeight: "700", color: "#111" }}
                                />
                            </View>
                        </View>

                        <View>
                            <Text style={{ fontSize: 13, color: "#666", marginBottom: 7, fontWeight: "800" }}>비밀번호</Text>
                            <View
                                style={{
                                    height: 50,
                                    paddingHorizontal: 12,
                                    borderRadius: 14,
                                    backgroundColor: "#F7F7F7",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 9,
                                    borderWidth: 1,
                                    borderColor: "#EFEFEF",
                                }}
                            >
                                <Ionicons name="lock-closed-outline" size={18} color="#777" />
                                <TextInput
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    placeholder="4자 이상"
                                    style={{ flex: 1, fontWeight: "700", color: "#111" }}
                                />
                            </View>
                        </View>

                        <Pressable
                            onPress={onRegister}
                            disabled={!canSubmit}
                            style={{
                                height: 54,
                                borderRadius: 15,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: canSubmit ? "#FF4D2D" : "#E0E0E0",
                                marginTop: 4,
                                flexDirection: "row",
                                gap: 8,
                            }}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="person-add-outline" size={18} color="#fff" />
                                    <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>계정 만들기</Text>
                                </>
                            )}
                        </Pressable>

                        <Link href="/login" asChild>
                            <Pressable
                                onPress={() => Haptics.selectionAsync()}
                                style={{ alignItems: "center", paddingVertical: 10 }}
                            >
                                <Text style={{ color: "#333", fontWeight: "800" }}>이미 계정이 있어요</Text>
                            </Pressable>
                        </Link>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
