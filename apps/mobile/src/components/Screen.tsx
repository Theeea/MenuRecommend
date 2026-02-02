import React from "react";
import { View, ViewStyle, StyleSheet } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../theme/colors";

export function Screen({
                           children,
                           style,
                           edges = ["top", "left", "right"],
                           bg = COLORS.bg,
                       }: {
    children: React.ReactNode;
    style?: ViewStyle;
    edges?: Edge[];
    bg?: string;
}) {
    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={edges}>
            <StatusBar style="dark" />
            <View style={[styles.inner, style]}>{children}</View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    inner: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
});
