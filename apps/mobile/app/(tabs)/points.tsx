import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { fetchMyPoints, fetchPointLedger, LedgerItem } from "../../src/api/points";
import * as Haptics from "expo-haptics";

function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Points() {
    const [balance, setBalance] = useState<number>(0);
    const [items, setItems] = useState<LedgerItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [p, ledger] = await Promise.all([
                fetchMyPoints(),
                fetchPointLedger({ take: 20 }),
            ]);
            setBalance(p.balance);
            setItems(ledger.items);
            setNextCursor(ledger.nextCursor);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const loadMore = useCallback(async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await fetchPointLedger({ take: 20, cursor: nextCursor });
            setItems((prev) => [...prev, ...res.items]);
            setNextCursor(res.nextCursor);
        } finally {
            setLoadingMore(false);
        }
    }, [nextCursor, loadingMore]);

    const renderItem = useCallback(({ item }: { item: LedgerItem }) => {
        const plus = item.points >= 0;
        return (
            <View
                style={{
                    backgroundColor: "#fff",
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    shadowColor: "#000",
                    shadowOpacity: 0.05,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                }}
            >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontWeight: "900", color: "#111" }}>
                        {item.note ?? item.source}
                    </Text>
                    <Text style={{ fontWeight: "900", color: plus ? "#FF4D2D" : "#111" }}>
                        {plus ? "+" : ""}
                        {item.points}
                    </Text>
                </View>

                <Text style={{ marginTop: 6, color: "#666", fontWeight: "700" }}>
                    {fmtDate(item.createdAt)} · 잔액 {item.balanceAfter}
                </Text>
            </View>
        );
    }, []);

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: "#FFF6EE", justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 10, color: "#666", fontWeight: "700" }}>불러오는 중…</Text>
            </View>
        );
    }

    return (
        <FlatList
            style={{ flex: 1, backgroundColor: "#FFF6EE" }}
            contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
            data={items}
            keyExtractor={(x) => x.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
                <View
                    style={{
                        backgroundColor: "#111",
                        borderRadius: 18,
                        padding: 16,
                        marginBottom: 14,
                    }}
                >
                    <Text style={{ color: "#FFF6EE", fontWeight: "900" }}>내 포인트</Text>
                    <Text style={{ marginTop: 6, color: "#FFF", fontSize: 32, fontWeight: "900" }}>
                        {balance}
                    </Text>
                    <Text style={{ marginTop: 6, color: "#FFD7CC", fontWeight: "700" }}>
                        적립/차감 내역은 아래에서 확인 가능
                    </Text>
                </View>
            }
            ListFooterComponent={
                loadingMore ? (
                    <View style={{ paddingVertical: 12, alignItems: "center" }}>
                        <ActivityIndicator />
                    </View>
                ) : null
            }
            ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: "#666", fontWeight: "700" }}>
                        아직 내역이 없어요. 인증하면 포인트가 쌓여!
                    </Text>
                </View>
            }
        />
    );
}
