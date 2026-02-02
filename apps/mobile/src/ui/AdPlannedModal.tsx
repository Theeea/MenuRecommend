import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

export function AdPlannedModal({
                                   visible,
                                   title = "광고(예정)",
                                   onClose,
                               }: {
    visible: boolean;
    title?: string;
    onClose: () => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade">
            <View
                style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.45)",
                    justifyContent: "center",
                    padding: 18,
                }}
            >
                <View
                    style={{
                        backgroundColor: "#fff",
                        borderRadius: 18,
                        padding: 16,
                        gap: 12,
                    }}
                >
                    <Text style={{ fontSize: 18, fontWeight: "900" }}>{title}</Text>
                    <View
                        style={{
                            height: 140,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: "#e5e5e5",
                            backgroundColor: "#fafafa",
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <Text style={{ fontWeight: "800", opacity: 0.7 }}>
                            여기에 광고 SDK가 들어갈 예정입니다
                        </Text>
                        <Text style={{ opacity: 0.55, marginTop: 4 }}>
                            (닫기 후 프로세스 진행)
                        </Text>
                    </View>

                    <Pressable
                        onPress={onClose}
                        style={{
                            backgroundColor: "#111",
                            paddingVertical: 14,
                            borderRadius: 14,
                            alignItems: "center",
                        }}
                    >
                        <Text style={{ color: "#fff", fontWeight: "900" }}>닫기</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}
