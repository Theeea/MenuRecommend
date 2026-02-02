import React, { useCallback, useMemo, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "../src/api/client";

export default function Proof() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        sessionId?: string;
        challengeCode?: string;
        menuName?: string;
    }>();

    const sessionId = String(params.sessionId ?? "");
    const challengeCode = String(params.challengeCode ?? "");
    const menuName = String(params.menuName ?? "");

    const [localUri, setLocalUri] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const canSubmit = useMemo(() => !!localUri && !!sessionId, [localUri, sessionId]);

    const takePhoto = useCallback(async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert("권한 필요", "카메라 권한을 허용해줘.");
            return;
        }

        await Haptics.selectionAsync();
        const res = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.8,
        });

        if (res.canceled) return;

        const uri = res.assets?.[0]?.uri;
        if (!uri) return;

        setLocalUri(uri);
    }, []);

    const uploadAndCreateProof = useCallback(async () => {
        if (!localUri) return;
        if (!sessionId) {
            Alert.alert("오류", "세션이 없어서 인증할 수 없어. 홈에서 다시 추천 받아줘.");
            router.back();
            return;
        }

        setUploading(true);
        try {
            // 1) 업로드
            const form = new FormData();
            form.append("file", {
                uri: localUri,
                name: "proof.jpg",
                type: "image/jpeg",
            } as any);

            const up = await api.post("/uploads/proof", form, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            const imageUrl =
                up.data?.url ??
                up.data?.imageUrl ??
                up.data?.location ??
                null;

            if (!imageUrl) {
                Alert.alert("업로드 실패", "서버 응답에 이미지 URL이 없어요.");
                return;
            }

            // 2) Proof 생성(포인트 지급)
            const { data } = await api.post("/proofs", {
                sessionId,
                imageUrl,
                challengeCode: challengeCode || undefined,
            });

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            const earned = data?.earned ?? 0;
            const balance = data?.balance ?? 0;

            Alert.alert("인증 완료!", `+${earned}p 적립\n현재 ${balance}p`, [
                { text: "포인트 보기", onPress: () => router.replace("/(tabs)/points") },
                { text: "닫기", style: "cancel", onPress: () => router.back() },
            ]);
        } catch (e: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("실패", "업로드/인증에 실패했어. 네트워크/서버 확인해줘.");
        } finally {
            setUploading(false);
        }
    }, [localUri, sessionId, challengeCode, router]);

    return (
        <View style={{ flex: 1, backgroundColor: "#FFF6EE", padding: 16 }}>
            <View
                style={{
                    backgroundColor: "#fff",
                    borderRadius: 18,
                    padding: 16,
                    shadowColor: "#000",
                    shadowOpacity: 0.06,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                }}
            >
                <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>
                    인증하기
                </Text>
                <Text style={{ marginTop: 8, color: "#666", fontWeight: "700" }}>
                    {menuName ? `메뉴: ${menuName}` : "메뉴를 인증해줘"}
                </Text>
                {!!challengeCode && (
                    <Text style={{ marginTop: 6, color: "#FF4D2D", fontWeight: "900" }}>
                        코드: {challengeCode}
                    </Text>
                )}
            </View>

            <View style={{ height: 14 }} />

            <View
                style={{
                    backgroundColor: "#fff",
                    borderRadius: 18,
                    padding: 16,
                    flex: 1,
                    shadowColor: "#000",
                    shadowOpacity: 0.06,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                }}
            >
                {localUri ? (
                    <Image
                        source={{ uri: localUri }}
                        style={{ width: "100%", height: 340, borderRadius: 16 }}
                        resizeMode="cover"
                    />
                ) : (
                    <View
                        style={{
                            height: 340,
                            borderRadius: 16,
                            backgroundColor: "#F7F7F7",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Text style={{ color: "#888", fontWeight: "800" }}>
                            사진을 촬영해줘
                        </Text>
                    </View>
                )}

                <View style={{ height: 12 }} />

                <Pressable
                    onPress={takePhoto}
                    style={{
                        paddingVertical: 14,
                        borderRadius: 14,
                        backgroundColor: "#111",
                        alignItems: "center",
                    }}
                >
                    <Text style={{ color: "#FFF", fontWeight: "900" }}>
                        카메라로 촬영하기
                    </Text>
                </Pressable>

                <View style={{ height: 10 }} />

                <Pressable
                    onPress={uploadAndCreateProof}
                    disabled={!canSubmit || uploading}
                    style={{
                        paddingVertical: 14,
                        borderRadius: 14,
                        backgroundColor: canSubmit && !uploading ? "#FF4D2D" : "#E0E0E0",
                        alignItems: "center",
                    }}
                >
                    <Text style={{ color: "#FFF", fontWeight: "900" }}>
                        {uploading ? "업로드 중..." : "인증 업로드"}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}
