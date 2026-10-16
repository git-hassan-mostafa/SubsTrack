import { useEffect } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "@/src/shared/components/Screen";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
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
import { COLORS } from "@/src/shared/constants";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { STAT_TONE, StatTile } from "@/src/shared/components/StatTile";
import { RevenueHeroCard } from "../components/RevenueHeroCard";
import { QuickActionButtons } from "../components/QuickActionButtons";

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

  useEffect(() => {
    fetchMetrics();
  }, [branchFilter, fetchMetrics]);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const tiles = metrics ? dashboardTiles(metrics, isAdmin) : [];

  return (
    <Screen>
      <PageHeader title={t("home.title")} />
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
          <View className="pt-2">
            <QuickActionButtons isAdmin={isAdmin} />
          </View>

          {error ? (
            <View className="mx-4 mb-4">
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

              <SectionLabel className="mx-5 mt-3 mb-2">
                {t("dashboard.this_month")}
              </SectionLabel>

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
    </Screen>
  );
}
