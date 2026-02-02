import React, { useCallback } from "react";
import { Tabs, useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth/authStore";
import * as Haptics from "expo-haptics";

export default function TabLayout() {
    const { signOut } = useAuth();
    const router = useRouter();

    const logout = useCallback(async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        await signOut();
        router.replace("/login");
    }, [signOut, router]);

    return (
        <Tabs
            screenOptions={{
                headerTitleAlign: "left",
                headerShadowVisible: false,
                headerStyle: { backgroundColor: "#FFF6EE" },
                headerTitleStyle: { fontWeight: "900" },
                tabBarStyle: {
                    backgroundColor: "#FFFFFF",
                    borderTopWidth: 0,
                    elevation: 0,
                },
                tabBarActiveTintColor: "#FF4D2D",
                tabBarInactiveTintColor: "#9AA0A6",
                headerRight: () =>
                    __DEV__ ? (
                        <Pressable
                            onPress={logout}
                            hitSlop={10}
                            style={{ paddingHorizontal: 14, paddingVertical: 8 }}
                        >
                            <Text style={{ fontWeight: "900", color: "#111" }}>
                                로그아웃
                            </Text>
                        </Pressable>
                    ) : null,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "오늘 뭐먹지",
                    tabBarLabel: "홈",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="sparkles" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="ingredients"
                options={{
                    title: "취향 설정",
                    tabBarLabel: "취향",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="options" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="points"
                options={{
                    title: "포인트",
                    tabBarLabel: "포인트",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="wallet" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
