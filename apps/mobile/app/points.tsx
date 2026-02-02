import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    SafeAreaView,
    Text,
    View,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/client";
import { hapticTap } from "../src/ui/haptics";

type PointsRes = { ok: true; balance: number };
type LedgerItem = {
    id: string;
    points: number;
    kind: string;
    source: string;
    note?: string | null;
    balanceAfter: number;
    createdAt: string;
};
type LedgerRes = { ok: true; items: LedgerItem[]; nextCursor: string | null };

export default function PointsScreen() {
    const router = useRouter();
    const [balance, setBalance] = useState(0);
    const [items, setItems] = useState<LedgerItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const loadTop = async () => {
        const p = await api.get<PointsRes>("/me/points");
        setBalance(p.data.balance ?? 0);

        const l = await api.get<LedgerRes>("/me/points/ledger?take=20");
        setItems(l.data.items ?? []);
        setNextCursor(l.data.nextCursor ?? null);
    };

    useEffect(() => {
        (async () => {
            try {
                await loadTop();
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await loadTop();
        } finally {
            setRefreshing(false);
        }
    };

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const l = await api.get<LedgerRes>(`/me/points/ledger?take=20&cursor=${encodeURIComponent(nextCursor)}`);
            setItems((prev) => [...prev, ...(l.data.items ?? [])]);
            setNextCursor(l.data.nextCursor ?? null);
        } finally {
            setLoadingMore(false);
        }
    };

    const back = async () => {
        await hapticTap();
        router.back();
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, padding: 16, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 22, fontWeight: "900" }}>포인트</Text>
                <Pressable onPress={back} style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 }}>
                    <Text>닫기</Text>
                </Pressable>
            </View>

            <View style={{ padding: 16, borderWidth: 1, borderRadius: 16 }}>
                <Text style={{ opacity: 0.7 }}>현재 잔액</Text>
                <Text style={{ fontSize: 28, fontWeight: "900" }}>{balance}P</Text>
            </View>

            <Text style={{ fontWeight: "800" }}>최근 내역</Text>

            <FlatList
                data={items}
                keyExtractor={(it) => it.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                onEndReachedThreshold={0.6}
                onEndReached={loadMore}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
                renderItem={({ item }) => {
                    const sign = item.points >= 0 ? "+" : "";
                    const dt = new Date(item.createdAt).toLocaleString();
                    return (
                        <View style={{ paddingVertical: 12, borderBottomWidth: 1 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontWeight: "800" }}>{sign}{item.points}P</Text>
                                <Text style={{ opacity: 0.6 }}>{dt}</Text>
                            </View>
                            <Text style={{ opacity: 0.8 }}>{item.note ?? `${item.source}`}</Text>
                            <Text style={{ opacity: 0.6 }}>잔액 {item.balanceAfter}P</Text>
                        </View>
                    );
                }}
            />
        </SafeAreaView>
    );
}
