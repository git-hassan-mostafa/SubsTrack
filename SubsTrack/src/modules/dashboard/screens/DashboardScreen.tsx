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
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const fmt = (usd: number) => formatMoney(usd, null, displayCurrency);

  const branchFilter = useEffectiveBranchFilter();

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
  const hasSalesRevenue = (metrics?.salesRevenue ?? 0) > 0;
  const hasOutstandingBalance = (metrics?.totalOutstandingBalance ?? 0) > 0;

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
            {/* Hero card — revenue + collection progress */}
            <View className="mx-4 mb-3 bg-primary rounded-2xl p-5">
              {/* Month label */}
              <Text className="text-xs text-indigo-300 uppercase tracking-widest mb-3">
                {t("dashboard.monthly_collected", { month: monthLabel, year })}
              </Text>

              {/* Total revenue */}
              <Text fontWeight="Bold" className="text-4xl text-white">
                {fmt(metrics?.monthlyRevenue ?? 0)}
              </Text>

              {/* Revenue breakdown — only shown when sales revenue exists */}
              {hasSalesRevenue ? (
                <View className="flex-row mt-3 gap-6">
                  <View>
                    <Text className="text-xs text-indigo-300 mb-0.5">
                      {t("dashboard.subscriptions")}
                    </Text>
                    <Text fontWeight="SemiBold" className="text-sm text-white">
                      {fmt(metrics?.subscriptionRevenue ?? 0)}
                    </Text>
                  </View>
                  <View className="w-px bg-indigo-500" />
                  <View>
                    <Text className="text-xs text-indigo-300 mb-0.5">
                      {t("dashboard.sales_label")}
                    </Text>
                    <Text fontWeight="SemiBold" className="text-sm text-white">
                      {fmt(metrics?.salesRevenue ?? 0)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Divider */}
              <View className="h-px bg-indigo-500 mt-4 mb-4" />

              {/* Collection progress */}
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs text-indigo-300 uppercase tracking-widest">
                  {t("dashboard.collection_progress")}
                </Text>
                <Text fontWeight="SemiBold" className="text-sm text-white">
                  {collectedPct}%
                </Text>
              </View>
              <View className="bg-white/25 rounded-full h-2 mb-2">
                <View
                  className="bg-white rounded-full h-2"
                  style={{ width: `${collectedPct}%` }}
                />
              </View>
              <Text className="text-xs text-indigo-300">
                {t("dashboard.paid_of_active", {
                  paid: paidCustomers,
                  total: activeCustomers,
                })}
              </Text>
            </View>

            {/* Stat cards */}
            <View className="flex-row mx-4 gap-3 mb-3">
              {/* Unpaid this month */}
              <View className="flex-1 bg-white border border-gray-100 rounded-2xl p-4">
                <Text className="text-xs text-gray-400 uppercase tracking-wide mb-3">
                  {t("dashboard.unpaid")}
                </Text>
                <Text
                  fontWeight="Bold"
                  className="text-3xl text-danger leading-none mb-1"
                >
                  {metrics?.unpaidThisMonth ?? 0}
                </Text>
                <Text className="text-xs text-gray-400">
                  {t("dashboard.customers_this_month")}
                </Text>
              </View>

              {/* Active customers */}
              <View className="flex-1 bg-white border border-gray-100 rounded-2xl p-4">
                <Text className="text-xs text-gray-400 uppercase tracking-wide mb-3">
                  {t("dashboard.active")}
                </Text>
                <Text
                  fontWeight="Bold"
                  className="text-3xl text-gray-900 leading-none mb-1"
                >
                  {activeCustomers}
                </Text>
                <Text className="text-xs text-gray-400">
                  {t("dashboard.of_total", {
                    total: metrics?.totalCustomers ?? 0,
                  })}
                </Text>
              </View>
            </View>

            {/* Outstanding balance — only shown when > 0 */}
            {hasOutstandingBalance ? (
              <View className="mx-4 mb-3 bg-white border border-amber-100 rounded-2xl p-4">
                <Text className="text-xs text-gray-400 uppercase tracking-wide mb-3">
                  {t("payments.outstanding_balance")}
                </Text>
                <Text
                  fontWeight="Bold"
                  className="text-3xl text-warning leading-none mb-1"
                >
                  {fmt(metrics?.totalOutstandingBalance ?? 0)}
                </Text>
                <Text className="text-xs text-gray-400">
                  {t("dashboard.partial_payments_note")}
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
