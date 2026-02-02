import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/authStore";

export default function LoginScreen() {
    const router = useRouter();
    const { signIn } = useAuth();

    const [email, setEmail] = useState("test1@example.com");
    const [password, setPassword] = useState("1234");
    const [busy, setBusy] = useState(false);

    const onLogin = async () => {
        setBusy(true);
        try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const { data } = await api.post("/auth/login", { email, password });
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
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF7E8" }} edges={["top", "left", "right"]}>
            <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12 }}>
                <Text style={{ fontSize: 30, fontWeight: "900" }}>Menu Reward</Text>
                <Text style={{ opacity: 0.7 }}>로그인 후 추천을 받을 수 있어요</Text>

                <View style={{ backgroundColor: "white", borderRadius: 16, padding: 12, gap: 10 }}>
                    <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="email"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={{ height: 44, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.04)" }}
                    />
                    <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="password"
                        secureTextEntry
                        style={{ height: 44, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.04)" }}
                    />
                </View>

                <Pressable
                    onPress={onLogin}
                    disabled={busy}
                    style={{ height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#FF7A2F" }}
                >
                    {busy ? <ActivityIndicator /> : <Text style={{ color: "white", fontWeight: "900" }}>로그인</Text>}
                </Pressable>

                <Pressable onPress={() => router.push("/register")} style={{ alignItems: "center", padding: 10 }}>
                    <Text style={{ fontWeight: "800", opacity: 0.75 }}>회원가입</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}
