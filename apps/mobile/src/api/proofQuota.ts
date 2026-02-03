import { api } from "./client";

export type ProofQuota = {
    ok: true;
    now: string;
    dailyLimit: number;
    remaining: number;
    cooldownHours: number;
    canVerify: boolean;
    code: "OK" | "VERIFY_DAILY_LIMIT" | "VERIFY_COOLDOWN";
    nextAvailableAt: string | null;
};

export async function fetchProofQuota() {
    const { data } = await api.get("/proofs/quota");
    return data as ProofQuota;
}
