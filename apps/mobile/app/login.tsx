import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/authStore";

export default function LoginScreen() {
    const router = useRouter();
    const { signIn } = useAuth();

    const [email, setEmail] = useState("test1@example.com");
    const [password, setPassword] = useState("1234");
    const [busy, setBusy] = useState(false);
    const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

    const onLogin = async () => {
        if (!canSubmit) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("입력 확인", "이메일과 비밀번호를 입력해 주세요.");
            return;
        }

        setBusy(true);
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const { data } = await api.post("/auth/login", { email: email.trim(), password });
            if (!data?.accessToken) throw new Error("no token");

            await signIn(data.accessToken);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace("/(tabs)");
        } catch {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("로그인 실패", "이메일/비밀번호를 확인해 주세요.");
        } finally {
            setBusy(false);
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
                        <Ionicons name="restaurant-outline" size={24} color="#fff" />
                    </View>

                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 30, fontWeight: "900", color: "#111" }}>Menu Reward</Text>
                        <Text style={{ color: "#555", lineHeight: 20, fontWeight: "700" }}>
                            로그인하고 오늘 먹을 메뉴를 추천받아 보세요.
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
                                    placeholder="email"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="email-address"
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
                                    placeholder="password"
                                    secureTextEntry
                                    style={{ flex: 1, fontWeight: "700", color: "#111" }}
                                />
                            </View>
                        </View>

                        <Pressable
                            onPress={onLogin}
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
                            {busy ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="log-in-outline" size={19} color="#fff" />
                                    <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>로그인</Text>
                                </>
                            )}
                        </Pressable>

                        <Pressable
                            onPress={async () => {
                                await Haptics.selectionAsync();
                                router.push("/register");
                            }}
                            style={{ alignItems: "center", paddingVertical: 10 }}
                        >
                            <Text style={{ fontWeight: "800", color: "#333" }}>회원가입</Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
