import React, { useState } from "react";
import { Alert, Button, Image, SafeAreaView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "../api/client";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/RootNavigator";

export default function ProofScreen({ route, navigation }: NativeStackScreenProps<AppStackParamList, "Proof">) {
    const { sessionId } = route.params;
    const [imageUrl, setImageUrl] = useState("https://example.com/sample.jpg");
    const [preview, setPreview] = useState<string | null>(null);

    const pick = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert("권한 필요", "사진 접근 권한을 허용해줘");

        const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
        if (res.canceled) return;

        // NOTE: 지금 백엔드는 imageUrl(서버가 접근 가능한 URL)을 기대함.
        // 일단 MVP는 로컬 uri를 미리보기로만 쓰고, 실제 전송은 imageUrl 텍스트로 처리.
        setPreview(res.assets[0].uri);
    };

    const submit = async () => {
        try {
            const res = await api.post("/proofs", { sessionId, imageUrl });
            Alert.alert("완료", "인증 제출됨");
            navigation.popToTop();
        } catch (e: any) {
            Alert.alert("에러", e?.response?.data?.message?.toString?.() ?? "제출 실패");
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
            <Text style={{ fontWeight: "700" }}>세션</Text>
            <Text selectable>{sessionId}</Text>

            <Button title="사진 고르기(미리보기)" onPress={pick} />
            {preview && <Image source={{ uri: preview }} style={{ width: "100%", height: 220, borderRadius: 12 }} />}

            <Text style={{ fontWeight: "700" }}>imageUrl</Text>
            <TextInput
                value={imageUrl}
                onChangeText={setImageUrl}
                placeholder="https://..."
                autoCapitalize="none"
                style={{ borderWidth: 1, padding: 12, borderRadius: 10 }}
            />

            <Button title="인증 제출" onPress={submit} />
        </SafeAreaView>
    );
}
