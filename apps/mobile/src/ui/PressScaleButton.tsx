import React, { useRef } from "react";
import { Animated, Pressable, Text, ViewStyle } from "react-native";

export function PressScaleButton({
                                     title,
                                     onPress,
                                     disabled,
                                     variant = "primary",
                                     style,
                                 }: {
    title: string;
    onPress: () => void | Promise<void>;
    disabled?: boolean;
    variant?: "primary" | "secondary" | "danger";
    style?: ViewStyle;
}) {
    const scale = useRef(new Animated.Value(1)).current;

    const bg =
        variant === "primary" ? "#111" : variant === "danger" ? "#b00020" : "#f2f2f2";
    const fg = variant === "primary" || variant === "danger" ? "#fff" : "#111";

    const onPressIn = () =>
        Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
    const onPressOut = () =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={{ opacity: disabled ? 0.55 : 1 }}
        >
            <Animated.View
                style={[
                    {
                        transform: [{ scale }],
                        backgroundColor: bg,
                        paddingVertical: 14,
                        paddingHorizontal: 14,
                        borderRadius: 14,
                        alignItems: "center",
                    },
                    style,
                ]}
            >
                <Text style={{ color: fg, fontWeight: "900", fontSize: 16 }}>{title}</Text>
            </Animated.View>
        </Pressable>
    );
}
