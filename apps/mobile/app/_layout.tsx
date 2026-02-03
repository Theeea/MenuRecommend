import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/authStore";

function AuthGate({ children }: { children: React.ReactNode }) {
    const { token, loading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;

        const first = segments[0]; // e.g. "(tabs)", "login"
        const inAuthScreen = first === "login" || first === "register";

        if (!token && !inAuthScreen) router.replace("/login");
        if (token && inAuthScreen) router.replace("/(tabs)");
    }, [token, loading, segments.join("/")]);

    return <>{children}</>;
}

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <AuthProvider>
                <AuthGate>
                    <Stack screenOptions={{ headerShown: false }}>
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="login" />
                        <Stack.Screen name="register" />
                        <Stack.Screen
                            name="proof"
                            options={{ headerShown: false, title: "인증" }}
                        />
                    </Stack>
                </AuthGate>
            </AuthProvider>
        </SafeAreaProvider>
    );
}
