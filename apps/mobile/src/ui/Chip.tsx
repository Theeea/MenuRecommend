import React from "react";
import { Text, View } from "react-native";

export function Chip({
                         label,
                         tone = "gray",
                     }: {
    label: string;
    tone?: "gray" | "warn" | "ok";
}) {
    const bg = tone === "warn" ? "#fff2f2" : tone === "ok" ? "#eefaf2" : "#f3f3f3";
    const bd = tone === "warn" ? "#ffd2d2" : tone === "ok" ? "#cfeedd" : "#e5e5e5";
    const fg = tone === "warn" ? "#9b1c1c" : tone === "ok" ? "#0f6b34" : "#333";

    return (
        <View
            style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: bg,
                borderWidth: 1,
                borderColor: bd,
            }}
        >
            <Text style={{ fontWeight: "800", color: fg, fontSize: 13 }}>{label}</Text>
        </View>
    );
}
