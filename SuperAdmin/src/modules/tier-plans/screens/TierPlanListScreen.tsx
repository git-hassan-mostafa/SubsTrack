import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import type { TierPlan } from "@/src/core/types";
import { useTierPlanStore } from "../store/tierPlanStore";
import { TierPlanFormSheet } from "../components/TierPlanFormSheet";

function formatLimit(v: number | null): string {
  return v === null ? "∞" : String(v);
}

export function TierPlanListScreen() {
  const { tierPlans, loading, error, fetchTierPlans, clearError } =
    useTierPlanStore();
  const [editing, setEditing] = useState<TierPlan | null>(null);

  useFocusEffect(useCallback(() => { fetchTierPlans(); }, []));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tier Plans</Text>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && tierPlans.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0a7ea4" size="large" />
        </View>
      ) : (
        <FlatList
          data={tierPlans}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchTierPlans} />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => setEditing(item)} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.price}>${item.priceMonthlyUsd}/mo</Text>
              </View>
              <View style={styles.grid}>
                <Text style={styles.cell}>Customers: {formatLimit(item.maxCustomers)}</Text>
                <Text style={styles.cell}>Users: {formatLimit(item.maxUsers)}</Text>
                <Text style={styles.cell}>Plans: {formatLimit(item.maxPlans)}</Text>
                <Text style={styles.cell}>Branches: {formatLimit(item.maxBranches)}</Text>
                <Text style={styles.cell}>Currencies: {formatLimit(item.maxCurrencies)}</Text>
                <Text style={styles.cell}>Grace: {item.graceDays}d</Text>
              </View>
              <View style={styles.flagRow}>
                <Text style={[styles.flag, item.multiCurrencyEnabled && styles.flagOn]}>
                  Multi-currency {item.multiCurrencyEnabled ? "✓" : "✗"}
                </Text>
                <Text style={[styles.flag, item.multiMonthPlansEnabled && styles.flagOn]}>
                  Multi-month {item.multiMonthPlansEnabled ? "✓" : "✗"}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              message="No tier plans configured"
              subMessage="Run the SQL script to seed the default Free / Pro / Business tiers"
            />
          }
        />
      )}

      <TierPlanFormSheet
        visible={!!editing}
        tierPlan={editing}
        onDismiss={() => setEditing(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1e293b" },
  errorContainer: { paddingHorizontal: 16, paddingTop: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, flexGrow: 1 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  name: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  price: { fontSize: 14, color: "#0a7ea4", fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: {
    fontSize: 12,
    color: "#475569",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  flagRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  flag: { fontSize: 12, color: "#94a3b8", fontWeight: "500" },
  flagOn: { color: "#16a34a" },
});
