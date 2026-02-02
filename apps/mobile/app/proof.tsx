import React, {useCallback, useMemo, useState} from "react";
import {
    Alert,
    Image,
    Pressable,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import {SafeAreaView, useSafeAreaInsets} from "react-native-safe-area-context";
import {Stack, useLocalSearchParams, useRouter} from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {Ionicons} from "@expo/vector-icons";
import {api} from "../src/api/client";

function guessMime(uri: string) {
    const lower = uri.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".heic")) return "image/heic";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
}

function guessName(uri: string) {
    const base = uri.split("/").pop();
    if (!base) return "proof.jpg";
    if (!base.includes(".")) return `${base}.jpg`;
    return base;
}

export default function Proof() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const {height} = useWindowDimensions();

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

    const canSubmit = useMemo(
        () => !!localUri && !!sessionId && !uploading,
        [localUri, sessionId, uploading]
    );

    const imageHeight = useMemo(() => {
        const h = Math.round(height * 0.42);
        return Math.min(360, Math.max(250, h));
    }, [height]);

    const takePhoto = useCallback(async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert("권한 필요", "카메라 권한을 허용해줘.");
            return;
        }

        await Haptics.selectionAsync();

        const res = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.85,
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
            // ✅ 업로드: boundary 문제 방지 위해 Content-Type 직접 지정하지 않음
            const form = new FormData();
            form.append("file", {
                uri: localUri,
                name: guessName(localUri),
                type: guessMime(localUri),
            } as any);
            form.append("sessionId", sessionId);
            if (challengeCode) form.append("challengeCode", challengeCode);

            const up = await api.post("/uploads/proof", form, {
                headers: {Accept: "application/json"},
            });

            const imageUrl =
                up.data?.url ??
                up.data?.imageUrl ??
                up.data?.location ??
                up.data?.data?.url ??
                null;

            if (!imageUrl) {
                Alert.alert("업로드 실패", "서버 응답에 이미지 URL이 없어요.");
                return;
            }

            // ✅ Proof 생성: /proofs 우선, 없으면 /proof fallback
            let created: any = null;
            try {
                const {data} = await api.post("/proofs", {
                    sessionId,
                    imageUrl,
                    challengeCode: challengeCode || undefined,
                });
                created = data;
            } catch (e: any) {
                if (e?.response?.status === 404) {
                    const {data} = await api.post("/proof", {
                        sessionId,
                        imageUrl,
                        challengeCode: challengeCode || undefined,
                    });
                    created = data;
                } else {
                    throw e;
                }
            }

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            const earned = created?.earned ?? created?.contents?.earned ?? 0;
            const balance = created?.balance ?? created?.contents?.balance ?? 0;

            Alert.alert("인증 완료!", `+${earned}p 적립\n현재 ${balance}p`, [
                {text: "포인트 보기", onPress: () => router.replace("/(tabs)/points")},
                {text: "닫기", style: "cancel", onPress: () => router.back()},
            ]);
        } catch (e: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

            const status = e?.response?.status;
            const msg =
                e?.response?.data?.message ??
                e?.response?.data?.error ??
                e?.message ??
                "업로드/인증에 실패했어.";

            if (status === 401) {
                Alert.alert("세션 만료", "다시 로그인 해줘.");
                router.replace("/login");
                return;
            }

            Alert.alert("실패", status ? `(${status}) ${msg}` : String(msg));
        } finally {
            setUploading(false);
        }
    }, [localUri, sessionId, challengeCode, router]);

    return (
        <>
            {/* ✅ 기본 헤더(좌측 (tabs) + 버튼) 제거 */}
            <Stack.Screen options={{headerShown: false}}/>

            <SafeAreaView style={{flex: 1, backgroundColor: "#FFF6EE"}} edges={["top", "bottom"]}>
                <ScrollView
                    style={{flex: 1}}
                    contentInsetAdjustmentBehavior="automatic"
                    contentContainerStyle={{padding: 16, paddingBottom: 16 + insets.bottom}}
                >
                    {/* ✅ blocked 스타일 헤더 */}
                    <View
                        style={{
                            backgroundColor: "#fff",
                            borderRadius: 18,
                            padding: 16,
                            shadowColor: "#000",
                            shadowOpacity: 0.06,
                            shadowRadius: 10,
                            shadowOffset: {width: 0, height: 4},
                        }}
                    >
                        <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
                            <View style={{flexDirection: "row", alignItems: "center", gap: 8}}>
                                <Pressable onPress={() => router.back()} hitSlop={10}>
                                    <Ionicons name="chevron-back" size={22} color="#111"/>
                                </Pressable>
                                <Text style={{fontSize: 18, fontWeight: "900", color: "#111"}}>인증하기</Text>
                            </View>
                        </View>

                        <Text style={{marginTop: 8, color: "#666", fontWeight: "700"}}>
                            {menuName ? `메뉴: ${menuName}` : "메뉴를 인증해줘"}
                        </Text>

                        {!!challengeCode && (
                            <Text style={{marginTop: 6, color: "#FF4D2D", fontWeight: "900"}}>
                                코드: {challengeCode}
                            </Text>
                        )}
                    </View>

                    <View style={{height: 14}}/>

                    {/* 카드 */}
                    <View
                        style={{
                            backgroundColor: "#fff",
                            borderRadius: 18,
                            padding: 16,
                            shadowColor: "#000",
                            shadowOpacity: 0.06,
                            shadowRadius: 10,
                            shadowOffset: {width: 0, height: 4},
                        }}
                    >
                        {localUri ? (
                            <Image
                                source={{uri: localUri}}
                                style={{width: "100%", height: imageHeight, borderRadius: 16}}
                                resizeMode="cover"
                            />
                        ) : (
                            <View
                                style={{
                                    height: imageHeight,
                                    borderRadius: 16,
                                    backgroundColor: "#F7F7F7",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <Text style={{color: "#888", fontWeight: "800"}}>사진을 촬영해줘</Text>
                            </View>
                        )}

                        <View style={{height: 12}}/>

                        <Pressable
                            onPress={takePhoto}
                            style={{
                                paddingVertical: 14,
                                borderRadius: 14,
                                backgroundColor: "#111",
                                alignItems: "center",
                            }}
                        >
                            <Text style={{color: "#FFF", fontWeight: "900"}}>카메라로 촬영하기</Text>
                        </Pressable>

                        <View style={{height: 10}}/>

                        <Pressable
                            onPress={uploadAndCreateProof}
                            disabled={!canSubmit}
                            style={{
                                paddingVertical: 14,
                                borderRadius: 14,
                                backgroundColor: canSubmit ? "#FF4D2D" : "#E0E0E0",
                                alignItems: "center",
                            }}
                        >
                            <Text style={{color: "#FFF", fontWeight: "900"}}>
                                {uploading ? "업로드 중..." : "인증 업로드"}
                            </Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </>
    );
}
