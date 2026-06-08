import { useEffect } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { getDateLocale } from "@/src/core/utils/date";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useDashboardSlice } from "@/src/state/hooks/useDashboardSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { BranchSelector } from "@/src/shared/components/BranchSelector";
import { COLORS } from "@/src/shared/constants";
import { MONTHS } from "@/src/core/constants";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";

export function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const metrics = useDashboardSlice((s) => s.metrics);
  const loading = useDashboardSlice((s) => s.loading);
  const error = useDashboardSlice((s) => s.error);
  const fetchMetrics = useDashboardSlice((s) => s.fetchMetrics);
  const clearError = useDashboardSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  // Metrics are stored canonical-USD; format for the user's display preference.
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const fmt = (usd: number) => formatMoney(usd, null, displayCurrency);

  const branchFilter = useEffectiveBranchFilter();

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  const now = new Date();
  const locale = getDateLocale(i18n.language);
  const monthLabel = t(`months.${MONTHS[now.getMonth()]}`);
  const year = now.getFullYear();
  const dateLabel = now.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const paidCustomers = Math.max(
    0,
    (metrics?.activeCustomers ?? 0) - (metrics?.unpaidThisMonth ?? 0),
  );
  const activeCustomers = metrics?.activeCustomers ?? 0;
  const collectedPct =
    activeCustomers > 0
      ? Math.round((paidCustomers / activeCustomers) * 100)
      : 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
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
        {/* Greeting */}
        <View className="px-5 pt-5 pb-4">
          <Text fontWeight="Bold" className="text-2xl text-gray-900">
            {t("dashboard.greeting", {
              name: user?.fullName ?? user?.username ?? "",
            })}
          </Text>
          <Text className="text-sm text-gray-500 mt-0.5">{dateLabel}</Text>
          <BranchSelector />
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
            {/* Hero card */}
            <View className="mx-4 mb-4 bg-primary rounded-2xl p-5 overflow-hidden">
              <View
                className="absolute w-40 h-40 rounded-full bg-white opacity-10"
                style={{ right: -20, top: -20 }}
              />
              <View
                className="absolute w-24 h-24 rounded-full bg-white opacity-10"
                style={{ right: 20, bottom: -10 }}
              />
              <Text className="text-xs font-semibold text-indigo-200 uppercase tracking-widest mb-2">
                {t("dashboard.monthly_collected", {
                  month: monthLabel,
                  year,
                })}
              </Text>
              <Text fontWeight="Bold" className="text-4xl text-white mb-1">
                {fmt(metrics?.monthlyRevenue ?? 0)}
              </Text>
              {(metrics?.salesRevenue ?? 0) > 0 ? (
                <Text className="text-xs text-indigo-100 mb-2">
                  {t("dashboard.revenue_breakdown", {
                    subscriptions: fmt(metrics?.subscriptionRevenue ?? 0),
                    sales: fmt(metrics?.salesRevenue ?? 0),
                  })}
                </Text>
              ) : null}
              <Text className="text-sm text-indigo-200 mb-3">
                {t("dashboard.collected_summary", {
                  paidCustomers,
                  activeCustomers,
                  collectedPct,
                })}
              </Text>
              {/* Progress bar */}
              <View className="bg-indigo-400 rounded-full h-1.5">
                <View
                  className="bg-white rounded-full h-1.5"
                  style={{ width: `${collectedPct}%` }}
                />
              </View>
            </View>

            {/* Stat cards */}
            <View className="flex-row mx-4 gap-3">
              <View className="flex-1 bg-white border border-gray-100 rounded-2xl p-4">
                <View className="flex-row items-center gap-1.5 mb-2">
                  <View className="w-2 h-2 rounded-full bg-danger" />
                  <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {t("dashboard.unpaid")}
                  </Text>
                </View>
                <Text fontWeight="Bold" className="text-3xl text-gray-900">
                  {metrics?.unpaidThisMonth ?? 0}
                </Text>
              </View>

              <View className="flex-1 bg-white border border-gray-100 rounded-2xl p-4">
                <View className="flex-row items-center gap-1.5 mb-2">
                  <View className="w-2 h-2 rounded-full bg-success" />
                  <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {t("dashboard.new_this_month")}
                  </Text>
                </View>
                <Text fontWeight="Bold" className="text-3xl text-gray-900">
                  {metrics?.totalCustomers ?? 0}
                </Text>
              </View>
            </View>

            {(metrics?.totalOutstandingBalance ?? 0) > 0 ? (
              <View className="mx-4 mt-3 bg-white border border-gray-100 rounded-2xl p-4">
                <View className="flex-row items-center gap-1.5 mb-2">
                  <View className="w-2 h-2 rounded-full bg-warning" />
                  <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {t("payments.outstanding_balance")}
                  </Text>
                </View>
                <Text fontWeight="Bold" className="text-3xl text-gray-900">
                  {fmt(metrics?.totalOutstandingBalance ?? 0)}
                </Text>
              </View>
            ) : null}

            <View className="h-6" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
