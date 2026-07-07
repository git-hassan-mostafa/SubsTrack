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
import { getDateLocale } from "@/src/core/utils/date";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useAuth } from "@/src/modules/auth";
import { useDashboardSlice } from "@/src/state/hooks/useDashboardSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { BranchSelector } from "@/src/shared/components/BranchSelector";
import { COLORS } from "@/src/shared/constants";
import { MONTHS } from "@/src/core/constants";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { CustomerFormSheet } from "@/src/modules/customers/components/CustomerFormSheet";
import { SaleFormSheet } from "@/src/modules/sales/components/SaleFormSheet";
import { StatTile } from "@/src/modules/dashboard/components/StatTile";
import { RevenueTrendChart } from "@/src/modules/dashboard/components/RevenueTrendChart";

export function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const metrics = useDashboardSlice((s) => s.metrics);
  const loading = useDashboardSlice((s) => s.loading);
  const error = useDashboardSlice((s) => s.error);
  const trend = useDashboardSlice((s) => s.trend);
  const trendAnchor = useDashboardSlice((s) => s.trendAnchor);
  const trendLoading = useDashboardSlice((s) => s.trendLoading);
  const fetchMetrics = useDashboardSlice((s) => s.fetchMetrics);
  const navigateTrend = useDashboardSlice((s) => s.navigateTrend);
  const clearError = useDashboardSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const fmt = (usd: number) => formatMoney(usd, null, displayCurrency);

  const branchFilter = useEffectiveBranchFilter();
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(false);

  useEffect(() => {
    fetchMetrics();
  }, [branchFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Month-over-month revenue change (null when there's no prior month to compare).
  const monthlyRevenue = metrics?.monthlyRevenue ?? 0;
  const prevMonthRevenue = metrics?.prevMonthRevenue ?? 0;
  const momPct =
    prevMonthRevenue > 0
      ? Math.round(((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : null;

  // Average subscription payment collected this month.
  const paymentsCount = metrics?.paymentsCollectedCount ?? 0;
  const avgPayment =
    paymentsCount > 0 ? (metrics?.subscriptionRevenue ?? 0) / paymentsCount : 0;

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

        {/* Quick actions */}
        <View className="flex-row mx-4 gap-3 mb-4">
          <PressableOpacity
            onPress={() => setCustomerFormOpen(true)}
            className="flex-1 flex-row items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3"
          >
            <View className="w-9 h-9 rounded-xl bg-indigo-50 items-center justify-center">
              <Ionicons name="person-add-outline" size={18} color={COLORS.primary} />
            </View>
            <Text fontWeight="SemiBold" className="text-sm text-gray-800">
              {t("customers.add")}
            </Text>
          </PressableOpacity>

          <PressableOpacity
            onPress={() => setSaleFormOpen(true)}
            className="flex-1 flex-row items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3"
          >
            <View className="w-9 h-9 rounded-xl bg-emerald-50 items-center justify-center">
              <Ionicons name="receipt-outline" size={18} color={COLORS.success} />
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

              {/* Month-over-month change — only when a prior month exists */}
              {momPct !== null ? (
                <View className="flex-row items-center mt-2">
                  <View
                    className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${
                      momPct >= 0 ? "bg-emerald-400/20" : "bg-red-400/20"
                    }`}
                  >
                    <Ionicons
                      name={momPct >= 0 ? "arrow-up" : "arrow-down"}
                      size={12}
                      color={momPct >= 0 ? "#6ee7b7" : "#fca5a5"}
                    />
                    <Text
                      fontWeight="SemiBold"
                      className={`text-xs ${momPct >= 0 ? "text-emerald-200" : "text-red-200"}`}
                    >
                      {Math.abs(momPct)}%
                    </Text>
                  </View>
                  <Text className="text-xs text-indigo-300 ml-2">
                    {t("dashboard.vs_last_month")}
                  </Text>
                </View>
              ) : null}

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

            {/* Revenue trend — navigable 6-month window */}
            {trend ? (
              <RevenueTrendChart
                data={trend}
                format={fmt}
                loading={trendLoading}
                onPrev={() => navigateTrend("prev")}
                onNext={() => navigateTrend("next")}
                nextDisabled={
                  !!trendAnchor &&
                  trendAnchor.year * 12 + trendAnchor.month >=
                    now.getFullYear() * 12 + (now.getMonth() + 1)
                }
              />
            ) : null}

            {/* This-month section heading */}
            <Text className="text-xs text-gray-400 uppercase tracking-wide mx-5 mt-2 mb-2">
              {t("dashboard.this_month")}
            </Text>

            {/* Stat grid */}
            <View className="mx-4 gap-3 mb-3">
              <View className="flex-row gap-3">
                <StatTile
                  label={t("dashboard.active")}
                  value={activeCustomers}
                  sub={t("dashboard.of_total", { total: metrics?.totalCustomers ?? 0 })}
                  icon="people-outline"
                />
                <StatTile
                  label={t("dashboard.unpaid")}
                  value={metrics?.unpaidThisMonth ?? 0}
                  sub={t("dashboard.customers_this_month")}
                  tone="danger"
                  icon="alert-circle-outline"
                />
              </View>

              <View className="flex-row gap-3">
                <StatTile
                  label={t("dashboard.new_customers")}
                  value={metrics?.newCustomersThisMonth ?? 0}
                  sub={t("dashboard.joined")}
                  tone="success"
                  icon="person-add-outline"
                />
                <StatTile
                  label={t("dashboard.cancelled")}
                  value={metrics?.cancelledThisMonth ?? 0}
                  sub={t("dashboard.left")}
                  icon="person-remove-outline"
                />
              </View>

              <View className="flex-row gap-3">
                <StatTile
                  label={t("dashboard.payments_recorded")}
                  value={paymentsCount}
                  sub={
                    paymentsCount > 0
                      ? t("dashboard.avg_each", { amount: fmt(avgPayment) })
                      : t("dashboard.this_month")
                  }
                  tone="primary"
                  icon="card-outline"
                />
                <StatTile
                  label={t("dashboard.sales_recorded")}
                  value={metrics?.salesCount ?? 0}
                  sub={t("dashboard.this_month")}
                  tone="primary"
                  icon="receipt-outline"
                />
              </View>
            </View>

            {/* Outstanding balance (money owed) — only shown when > 0 */}
            {hasOutstandingBalance ? (
              <View className="flex-row mx-4 mb-3">
                <StatTile
                  label={t("payments.outstanding_balance")}
                  value={fmt(metrics?.totalOutstandingBalance ?? 0)}
                  sub={t("dashboard.partial_payments_note")}
                  tone="warning"
                  icon="hourglass-outline"
                />
              </View>
            ) : null}

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
