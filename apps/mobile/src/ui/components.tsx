import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { theme } from "./theme";
import * as Haptics from "expo-haptics";

export function Card({ children }: { children: React.ReactNode }) {
    return (
        <View
            style={{
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.card,
                borderWidth: 1,
                borderColor: theme.colors.line,
                padding: 16,
                shadowColor: theme.colors.shadow,
                shadowOpacity: 1,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
            }}
        >
            {children}
        </View>
    );
}

export function Title({ children }: { children: React.ReactNode }) {
    return (
        <Text style={{ fontSize: 22, fontWeight: "900", color: theme.colors.text }}>
            {children}
        </Text>
    );
}

export function SubText({ children }: { children: React.ReactNode }) {
    return (
        <Text style={{ fontSize: 13, color: theme.colors.subtext, lineHeight: 18 }}>
            {children}
        </Text>
    );
}

type BtnProps = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: "primary" | "ghost" | "danger";
};

export function Button({
                           label,
                           onPress,
                           disabled,
                           loading,
                           variant = "primary",
                       }: BtnProps) {
    const bg =
        variant === "primary"
            ? theme.colors.primary
            : variant === "danger"
                ? theme.colors.danger
                : "transparent";

    const border =
        variant === "ghost" ? { borderWidth: 1, borderColor: theme.colors.line } : null;

    const textColor = variant === "ghost" ? theme.colors.text : "#fff";

    return (
        <Pressable
            disabled={disabled || loading}
            onPress={async () => {
                try {
                    await Haptics.selectionAsync();
                } catch {}
                onPress();
            }}
            style={{
                backgroundColor: bg,
                borderRadius: theme.radius.card,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                opacity: disabled || loading ? 0.5 : 1,
                ...border,
            }}
        >
            {loading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <ActivityIndicator />
                    <Text style={{ fontWeight: "900", color: textColor }}>처리 중…</Text>
                </View>
            ) : (
                <Text style={{ fontWeight: "900", color: textColor }}>{label}</Text>
            )}
        </Pressable>
    );
}

export function Chip({
                         label,
                         active,
                         onPress,
                     }: {
    label: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={async () => {
                try {
                    await Haptics.selectionAsync();
                } catch {}
                onPress();
            }}
            style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: theme.radius.pill,
                backgroundColor: active ? "rgba(255,107,53,0.12)" : "#fff",
                borderWidth: 1,
                borderColor: active ? "rgba(255,107,53,0.35)" : theme.colors.line,
            }}
        >
            <Text style={{ fontWeight: "800", color: theme.colors.text }}>{label}</Text>
        </Pressable>
    );
}
