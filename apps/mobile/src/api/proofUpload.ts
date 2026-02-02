import { api } from "./client";

export async function uploadProof(params: {
    sessionId: string;
    challengeCode: string;
    imageUri: string; // file://...
}) {
    const form = new FormData();
    form.append("sessionId", params.sessionId);
    form.append("challengeCode", params.challengeCode);

    form.append("image", {
        uri: params.imageUri,
        name: "proof.jpg",
        type: "image/jpeg",
    } as any);

    // ✅ axios는 multipart 헤더를 자동 세팅하는 편이 안전함
    const res = await api.post("/proofs/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
    });

    return res.data;
}
