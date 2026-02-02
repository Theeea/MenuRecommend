import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "MR_TOKEN";

export async function getToken() {
    return AsyncStorage.getItem(KEY);
}
export async function setToken(token: string) {
    await AsyncStorage.setItem(KEY, token);
}
export async function clearToken() {
    await AsyncStorage.removeItem(KEY);
}

type AuthCtx = {
    token: string | null;
    loading: boolean;
    signIn: (token: string) => Promise<void>;
    signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [tokenState, setTokenState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setTokenState(await getToken());
            setLoading(false);
        })();
    }, []);

    const value = useMemo<AuthCtx>(
        () => ({
            token: tokenState,
            loading,
            signIn: async (t) => {
                await setToken(t);
                setTokenState(t);
            },
            signOut: async () => {
                await clearToken();
                setTokenState(null);
            },
        }),
        [tokenState, loading],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
    const v = useContext(Ctx);
    if (!v) throw new Error("AuthProvider missing");
    return v;
}
