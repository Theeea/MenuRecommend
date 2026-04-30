import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { proofResultLabel } from "@menu-reward/shared";
import { api } from "../src/api/client";
import { SafeAreaView } from "react-native-safe-area-context";

type ProofStatusResponse = {
    ok?: boolean;
    session?: {
        id: string;
        status?: string;
        doneAt?: string | null;
        menu?: { id: string; name: string } | null;
    };
    proof?: {
        id: string;
        sessionId: string;
        imageUrl: string;
        aiResult: "PENDING" | "HOLD" | "PASS" | "FAIL";
        aiScore: number;
        aiModel?: string | null;
        aiMeta?: any;
        createdAt: string;
        reviewedAt?: string | null;
    } | null;
};

function fmtRemain(seconds: number) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;

    if (h > 0) return `${h}시간 ${m}분`;
    if (m > 0) return `${m}분`;
    return `${ss}초`;
}

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

    // ✅ 서버 상태 기반 업로드 제한
    const [statusLoading, setStatusLoading] = useState(false);
    const [proofStatus, setProofStatus] = useState<ProofStatusResponse | null>(null);
    const currentProof = proofStatus?.proof ?? null;
    const currentAiResult = currentProof?.aiResult ?? null;

    const hasSubmittedProof = !!currentProof;

    const blockedText = useMemo(() => {
        if (!currentAiResult) return "";
        if (currentAiResult === "PENDING") return "현재 인증이 검토중이라 추가 업로드가 제한돼요.";
        if (currentAiResult === "HOLD") return "현재 인증이 보류(검토) 상태라 추가 업로드가 제한돼요.";
        if (currentAiResult === "PASS") return "이미 승인된 인증이 있어 추가 촬영/업로드가 제한돼요.";
        if (currentAiResult === "FAIL") return "이미 거절 처리된 인증이 있어 추가 촬영/업로드가 제한돼요.";
        return "";
    }, [currentAiResult]);

    const canSubmit = useMemo(() => {
        return !!localUri && !!sessionId && !uploading && !hasSubmittedProof;
    }, [localUri, sessionId, uploading, hasSubmittedProof]);

    const refreshProofStatus = useCallback(async (): Promise<ProofStatusResponse | null> => {
        if (!sessionId) return null;
        setStatusLoading(true);
        try {
            const { data } = await api.get<ProofStatusResponse>(`/me/proof-status/${sessionId}`);
            setProofStatus(data ?? null);
            return data ?? null;
        } catch {
            // 상태 조회 실패는 UX 방해하지 않게 조용히 무시(버튼은 서버가 최종 방어)
            // console.log("proof-status fetch failed", e?.response?.status, e?.response?.data);
            return null;
        } finally {
            setStatusLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId) return;
        refreshProofStatus();
    }, [sessionId, refreshProofStatus]);

    const showBlockedAlert = useCallback(() => {
        const label = proofResultLabel(currentAiResult, currentAiResult ?? "");

        Alert.alert(
            "추가 업로드 불가",
            `${blockedText}\n\n현재 상태: ${label}\n포인트 내역에서 진행/결과를 확인할 수 있어요.`,
            [
                { text: "포인트 보기", onPress: () => router.replace("/(tabs)/points") },
                { text: "닫기", style: "cancel" },
            ]
        );
    }, [blockedText, currentAiResult, router]);

    const takePhoto = useCallback(async () => {
        if (hasSubmittedProof) {
            showBlockedAlert();
            return;
        }

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
    }, [hasSubmittedProof, showBlockedAlert]);

    const explainServerLimit = useCallback(
        async (data: any, status?: number) => {
            const code = String(data?.code ?? "").toUpperCase();
            const msg = String(data?.message ?? "");

            if (code === "PROOF_PENDING") {
                await refreshProofStatus();
                Alert.alert(
                    "검토중",
                    "이미 인증이 접수되어 검토중이에요.\n포인트 내역에서 진행상태를 확인해줘.",
                    [
                        { text: "포인트 보기", onPress: () => router.replace("/(tabs)/points") },
                        { text: "닫기", style: "cancel" },
                    ]
                );
                return true;
            }

            if (code === "PROOF_COOLDOWN") {
                const retryAfterSeconds = Number(data?.retryAfterSeconds ?? 0);
                const nextAllowedAt = data?.nextAllowedAt ? new Date(String(data.nextAllowedAt)).getTime() : null;

                let remainText = "";
                if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
                    remainText = fmtRemain(retryAfterSeconds);
                } else if (nextAllowedAt) {
                    const diff = Math.max(0, Math.floor((nextAllowedAt - Date.now()) / 1000));
                    remainText = fmtRemain(diff);
                }

                Alert.alert(
                    "잠시만!",
                    remainText
                        ? `쿨타임이 적용되어 있어요.\n${remainText} 후 다시 인증할 수 있어요.`
                        : `쿨타임이 적용되어 있어요.\n잠시 후 다시 시도해줘.`
                );
                return true;
            }

            if (code === "PROOF_DAILY_LIMIT") {
                Alert.alert("오늘은 여기까지!", "오늘 인증 가능 횟수를 모두 사용했어요. 내일 다시 시도해줘.");
                return true;
            }

            // 그 외는 기본 에러 메시지
            Alert.alert(
                "실패",
                msg
                    ? `${msg}${status ? ` (status ${status})` : ""}`
                    : status
                        ? `요청에 실패했어. (status ${status})`
                        : "요청에 실패했어."
            );
            return true;
        },
        [refreshProofStatus, router]
    );

    const uploadAndCreateProof = useCallback(async () => {
        if (!localUri) return;

        if (!sessionId) {
            Alert.alert("오류", "세션이 없어서 인증할 수 없어. 홈에서 다시 추천 받아줘.");
            router.back();
            return;
        }

        // ✅ 업로드 직전 한번 더 상태 체크(중복 업로드 방지)
        const latest = await refreshProofStatus();
        const ai = (latest?.proof?.aiResult ?? null) as any;
        if (latest?.proof) {
            const msg =
                ai === "PENDING"
                    ? "현재 인증이 검토중이라 추가 업로드가 제한돼요."
                    : ai === "HOLD"
                        ? "현재 인증이 보류(검토) 상태라 추가 업로드가 제한돼요."
                        : ai === "PASS"
                            ? "이미 승인된 인증이 있어 추가 업로드가 제한돼요."
                            : "이미 거절 처리된 인증이 있어 추가 업로드가 제한돼요.";
            Alert.alert(
                "추가 업로드 불가",
                `${msg}\n\n현재 상태: ${proofResultLabel(ai, ai)}\n포인트 내역에서 진행/결과를 확인할 수 있어요.`,
                [
                    { text: "포인트 보기", onPress: () => router.replace("/(tabs)/points") },
                    { text: "닫기", style: "cancel" },
                ]
            );
            return;
        }

        setUploading(true);
        try {
            // 1) 업로드
            const form = new FormData();
            form.append("sessionId", sessionId);
            form.append("file", {
                uri: localUri,
                name: "proof.jpg",
                type: "image/jpeg",
            } as any);

            const up = await api.post("/uploads/proof", form, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000, // 2분
            });

            const proofUrl = up.data?.url ?? up.data?.imageUrl ?? up.data?.location ?? null;
            const rawUrl = up.data?.rawUrl ?? null;

            if (!proofUrl) {
                Alert.alert("업로드 실패", "서버 응답에 proof URL이 없어요.");
                return;
            }
            if (!rawUrl) {
                Alert.alert("업로드 실패", "서버 응답에 raw URL이 없어요.");
                return;
            }

            // 2) Proof 큐 등록
            const { data } = await api.post("/proofs", {
                sessionId,
                imageUrl: proofUrl, // 워터마크 이미지
                rawUrl,             // raw 이미지
                challengeCode: challengeCode || undefined,
            });

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // 업로드 후 상태 갱신
            await refreshProofStatus();

            const earned = data?.earned ?? 0;
            const balance = data?.balance ?? 0;
            const aiResult = data?.aiResult ?? "PENDING";

            let extraMsg = "";
            if (aiResult === "PASS") extraMsg = "\nAI 판정: 통과 ✅";
            else if (aiResult === "HOLD") extraMsg = "\nAI 판정: 보류(검토) ⏳";
            else if (aiResult === "FAIL") extraMsg = "\nAI 판정: 실패 ❌";
            else extraMsg = "\nAI 판정: 대기 ⏳";

            Alert.alert("인증 접수!", `+${earned}p 적립\n현재 ${balance}p${extraMsg}`, [
                { text: "포인트 보기", onPress: () => router.replace("/(tabs)/points") },
                { text: "닫기", style: "cancel", onPress: () => router.back() },
            ]);
        } catch (e: any) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

            const status = e?.response?.status;
            const data = e?.response?.data;

            console.log("PROOF ERROR", {
                message: e?.message,
                status,
                data,
                url: e?.config?.url,
            });

            // ✅ 서버 정책 에러코드 UX 처리
            await explainServerLimit(data, status);
        } finally {
            setUploading(false);
        }
    }, [
        localUri,
        sessionId,
        challengeCode,
        router,
        refreshProofStatus,
        explainServerLimit,
    ]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF6EE" }} edges={["top", "bottom"]}>
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
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 18, fontWeight: "900", color: "#111" }}>인증하기</Text>

                        <Pressable
                            onPress={refreshProofStatus}
                            style={{
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 10,
                                backgroundColor: "#F3F4F6",
                            }}
                        >
                            <Text style={{ fontWeight: "900", color: "#111", fontSize: 12 }}>
                                {statusLoading ? "확인중..." : "상태 새로고침"}
                            </Text>
                        </Pressable>
                    </View>

                    <Text style={{ marginTop: 8, color: "#666", fontWeight: "700" }}>
                        {menuName ? `메뉴: ${menuName}` : "메뉴를 인증해줘"}
                    </Text>

                    {!!challengeCode && (
                        <Text style={{ marginTop: 6, color: "#FF4D2D", fontWeight: "900" }}>
                            코드: {challengeCode}
                        </Text>
                    )}

                    {/* ✅ 현재 상태 표시 */}
                    <View style={{ marginTop: 10 }}>
                        {statusLoading ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <ActivityIndicator />
                                <Text style={{ color: "#6B7280", fontWeight: "800" }}>상태 확인 중…</Text>
                            </View>
                        ) : currentAiResult ? (
                            <View
                                style={{
                                    padding: 10,
                                    borderRadius: 12,
                                    backgroundColor: hasSubmittedProof ? "#FFF7ED" : "#F0FDF4",
                                    borderWidth: 1,
                                    borderColor: hasSubmittedProof ? "#FDBA74" : "#86EFAC",
                                }}
                            >
                                <Text style={{ fontWeight: "900", color: "#111" }}>
                                    현재 상태:{" "}
                                    {proofResultLabel(currentAiResult, currentAiResult ?? "")}
                                </Text>
                                {!!blockedText && (
                                    <Text style={{ marginTop: 6, color: "#6B7280", fontWeight: "700", lineHeight: 18 }}>
                                        {blockedText}
                                    </Text>
                                )}

                                <Pressable
                                    onPress={() => router.replace("/(tabs)/points")}
                                    style={{
                                        marginTop: 10,
                                        paddingVertical: 10,
                                        borderRadius: 12,
                                        backgroundColor: "#111",
                                        alignItems: "center",
                                    }}
                                >
                                    <Text style={{ color: "#fff", fontWeight: "900" }}>포인트 내역에서 확인</Text>
                                </Pressable>
                            </View>
                        ) : null}
                    </View>
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
                                {hasSubmittedProof ? "이미 접수된 인증이 있어요" : "사진을 촬영해줘"}
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 12 }} />

                    <Pressable
                        onPress={takePhoto}
                        style={{
                            paddingVertical: 14,
                            borderRadius: 14,
                            backgroundColor: hasSubmittedProof ? "#D1D5DB" : "#111",
                            alignItems: "center",
                            opacity: uploading ? 0.6 : 1,
                        }}
                        disabled={uploading || hasSubmittedProof}
                    >
                        <Text style={{ color: "#FFF", fontWeight: "900" }}>
                            {hasSubmittedProof ? "이미 인증 접수됨" : "카메라로 촬영하기"}
                        </Text>
                    </Pressable>

                    <View style={{ height: 10 }} />

                    <Pressable
                        onPress={() => {
                            if (hasSubmittedProof) {
                                showBlockedAlert();
                                return;
                            }
                            uploadAndCreateProof();
                        }}
                        disabled={!canSubmit}
                        style={{
                            paddingVertical: 14,
                            borderRadius: 14,
                            backgroundColor: canSubmit ? "#FF4D2D" : "#E0E0E0",
                            alignItems: "center",
                        }}
                    >
                        <Text style={{ color: "#FFF", fontWeight: "900" }}>
                            {uploading
                                ? "업로드 중..."
                                : hasSubmittedProof
                                    ? "업로드 불가"
                                    : "인증 업로드"}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}
