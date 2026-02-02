import React, { useState } from "react";
import { Alert, Button, SafeAreaView, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { useAuth } from "../auth/authStore";

export default function LoginScreen() {
    const { signIn } = useAuth();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("test1@example.com");
    const [password, setPassword] = useState("1234");

    const submit = async () => {
        try {
            const url = mode === "login" ? "/auth/login" : "/auth/register";
            const res = await api.post(url, { email, password });
            await signIn(res.data.accessToken);
        } catch (e: any) {
            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "요청 실패");
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: "700" }}>Menu Reward</Text>

            <TextInput
                placeholder="email"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
            />
            <TextInput
                placeholder="password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
            />

            <Button title={mode === "login" ? "로그인" : "회원가입"} onPress={submit} />

            <View style={{ height: 10 }} />
            <Button
                title={mode === "login" ? "회원가입으로" : "로그인으로"}
                onPress={() => setMode(mode === "login" ? "register" : "login")}
            />
        </SafeAreaView>
    );
}
