import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDashboardStore } from "@shared/modules/dashboard/state/dashboardStore";
import {
  dashboardTiles,
  type DashboardTile,
  type DashboardTileKey,
} from "@shared/modules/dashboard/utils/dashboardView";
import {
  formatKpiValue,
  formatKpiValues,
} from "@shared/modules/reports/utils/reportKpis";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { BranchSelector } from "@/src/shared/components/BranchSelector";
import { QuickActionsMenuButton } from "@/src/shared/components/QuickActionsMenuButton";
import { CARD_SURFACE, COLORS } from "@/src/shared/constants";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { CustomerFormSheet } from "@/src/modules/customer/customers/components/CustomerFormSheet";
import { SaleFormSheet } from "@/src/modules/transaction/sales/components/SaleFormSheet";
import { STAT_TONE, StatTile } from "@/src/shared/components/StatTile";
import { RevenueHeroCard } from "../components/RevenueHeroCard";

const TILE_ICON: Record<DashboardTileKey, keyof typeof Ionicons.glyphMap> = {
  active: "people-outline",
  unpaid: "alert-circle-outline",
  new_customers: "person-add-outline",
  cancelled: "person-remove-outline",
  payments: "card-outline",
  sales: "receipt-outline",
  expenses: "trending-down-outline",
  net: "stats-chart-outline",
  wallets: "wallet-outline",
  debt: "hourglass-outline",
};

// Half tiles pair up; a money tile takes the whole row so its amount fits.
function tileRows(tiles: DashboardTile[]): DashboardTile[][] {
  const rows: DashboardTile[][] = [];
  for (const tile of tiles) {
    const last = rows[rows.length - 1];
    if (!tile.wide && last && last.length === 1 && !last[0].wide) last.push(tile);
    else rows.push([tile]);
  }
  return rows;
}

export function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const metrics = useDashboardStore((s) => s.metrics);
  const loading = useDashboardStore((s) => s.loading);
  const error = useDashboardStore((s) => s.error);
  const fetchMetrics = useDashboardStore((s) => s.fetchMetrics);
  const clearError = useDashboardStore((s) => s.clearError);
  const displayCurrency = useDisplayCurrency();

  const branchFilter = useEffectiveBranchFilter();
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(false);

  useEffect(() => {
    fetchMetrics();
  }, [branchFilter, fetchMetrics]);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const tiles = metrics ? dashboardTiles(metrics, isAdmin) : [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ResponsiveContainer className="flex-1">
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchMetrics}
              tintColor={COLORS.primary}
            />
          }
        >
          <View className="flex-row items-center gap-2 px-5 pt-5 pb-4">
            <Text
              fontWeight="Bold"
              className="flex-1 text-2xl text-gray-900"
              numberOfLines={1}
            >
              {t("home.title")}
            </Text>
            <BranchSelector className="" />
            <QuickActionsMenuButton />
          </View>

          <View className="flex-row mx-4 gap-3 mb-4">
            <PressableOpacity
              onPress={() => setCustomerFormOpen(true)}
              className={`${CARD_SURFACE} flex-1 flex-row items-center gap-3 px-4 py-3`}
            >
              <View className="w-9 h-9 rounded-xl bg-indigo-50 items-center justify-center">
                <Ionicons
                  name="person-add-outline"
                  size={18}
                  color={COLORS.primary}
                />
              </View>
              <Text fontWeight="SemiBold" className="text-sm text-gray-800">
                {t("customers.add")}
              </Text>
            </PressableOpacity>

            <PressableOpacity
              onPress={() => setSaleFormOpen(true)}
              className={`${CARD_SURFACE} flex-1 flex-row items-center gap-3 px-4 py-3`}
            >
              <View className="w-9 h-9 rounded-xl bg-emerald-50 items-center justify-center">
                <Ionicons
                  name="receipt-outline"
                  size={18}
                  color={COLORS.success}
                />
                <View className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-50 items-center justify-center">
                  <Ionicons name="add" size={11} color={COLORS.success} />
                </View>
              </View>
              <Text fontWeight="SemiBold" className="text-sm text-gray-800">
                {t("sales.record_button")}
              </Text>
            </PressableOpacity>
          </View>

          {error ? (
            <View className="mx-5 mb-4">
              <ErrorBanner message={error} onDismiss={clearError} />
            </View>
          ) : null}

          {loading && !metrics ? (
            <View className="flex-1 items-center justify-center py-20">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              {metrics ? (
                <RevenueHeroCard
                  metrics={metrics}
                  isAdmin={isAdmin}
                  displayCurrency={displayCurrency}
                  onPress={() => router.push("/(app)/(tabs)/reports" as Href)}
                />
              ) : null}

              <Text className="text-xs text-gray-400 uppercase tracking-wide mx-5 mt-2 mb-2">
                {t("dashboard.this_month")}
              </Text>

              <View className="mx-4 gap-3 mb-3">
                {tileRows(tiles).map((row) => (
                  <View key={row[0].key} className="flex-row gap-3">
                    {row.map((tile) => (
                      <StatTile
                        key={tile.key}
                        label={t(tile.labelKey)}
                        value={formatKpiValue(tile.value, displayCurrency)}
                        sub={t(
                          tile.subKey,
                          formatKpiValues(tile.subValues, displayCurrency),
                        )}
                        tone={STAT_TONE[tile.tone]}
                        icon={TILE_ICON[tile.key]}
                      />
                    ))}
                  </View>
                ))}
              </View>

              <View className="h-6" />
            </>
          )}
        </ScrollView>
      </ResponsiveContainer>

      {customerFormOpen && (
        <CustomerFormSheet onDismiss={() => setCustomerFormOpen(false)} />
      )}

      {saleFormOpen && (
        <SaleFormSheet onDismiss={() => setSaleFormOpen(false)} />
      )}
    </SafeAreaView>
  );
}
