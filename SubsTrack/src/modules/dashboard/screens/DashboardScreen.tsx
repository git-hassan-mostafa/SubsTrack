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
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useAuth } from "@/src/modules/authentication/auth";
import { useDashboardSlice } from "@/src/state/hooks/useDashboardSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { BranchSelector } from "@/src/shared/components/BranchSelector";
import { QuickActionsMenuButton } from "@/src/shared/components/QuickActionsMenuButton";
import { COLORS } from "@/src/shared/constants";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { CustomerFormSheet } from "@/src/modules/customer/customers/components/CustomerFormSheet";
import { SaleFormSheet } from "@/src/modules/transaction/sales/components/SaleFormSheet";
import { StatTile } from "@/src/shared/components/StatTile";
import { RevenueHeroCard } from "../components/RevenueHeroCard";

export function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const metrics = useDashboardSlice((s) => s.metrics);
  const loading = useDashboardSlice((s) => s.loading);
  const error = useDashboardSlice((s) => s.error);
  const fetchMetrics = useDashboardSlice((s) => s.fetchMetrics);
  const clearError = useDashboardSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const fmt = (usd: number) => formatMoney(usd, null, displayCurrency);

  const branchFilter = useEffectiveBranchFilter();
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [saleFormOpen, setSaleFormOpen] = useState(false);

  useEffect(() => {
    fetchMetrics();
  }, [branchFilter, fetchMetrics]);

  const activeCustomers = metrics?.activeCustomers ?? 0;
  const hasDebt = (metrics?.totalDebt ?? 0) > 0;

  // Collector wallets — admin overview of cash collected but not yet handed over.
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const walletCash = metrics?.walletCash ?? 0;
  const hasWalletCash = isAdmin && walletCash > 0;

  // Money out this month. Admin-only (the service returns 0 for anyone else), so
  // a collector's hero card and stat grid look exactly as they did before.
  const monthlyExpenses = metrics?.monthlyExpenses ?? 0;
  const netIncome = metrics?.netIncome ?? 0;
  // With nothing spent, Net is just Revenue again — so the whole money-out
  // section stays hidden rather than repeating the number next to a $0.00.
  const showExpenses = isAdmin && monthlyExpenses > 0;

  const monthlyRevenue = metrics?.monthlyRevenue ?? 0;

  // Subscription payments collected this month.
  const paymentsCount = metrics?.paymentsCollectedCount ?? 0;

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
          {/* Greeting — name, branch chip and quick actions share one row, the
              same arrangement PageHeader uses on every other screen. */}
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

          {/* Quick actions */}
          <View className="flex-row mx-4 gap-3 mb-4">
            <PressableOpacity
              onPress={() => setCustomerFormOpen(true)}
              className="flex-1 flex-row items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3"
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
              className="flex-1 flex-row items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3"
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
              {/* Hero card — this month's money, tapping through to the
                  full report. Both the dashboard and Reports are admin-only
                  tabs, so anyone seeing this card can open it. */}
              <RevenueHeroCard
                metrics={metrics}
                fmt={fmt}
                showExpenses={showExpenses}
                onPress={() => router.push("/(app)/(tabs)/reports" as Href)}
              />

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
                    sub={t("dashboard.of_total", {
                      total: metrics?.totalCustomers ?? 0,
                    })}
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
                    sub={t("dashboard.this_month")}
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

              {/* Money out this month, and what's left after it — admin-only.
                  Full-width like the other money tiles: a formatted amount at
                  text-3xl doesn't fit half a phone screen. */}
              {showExpenses ? (
                <>
                  <View className="flex-row mx-4 mb-3">
                    <StatTile
                      label={t("dashboard.expenses_label")}
                      value={fmt(monthlyExpenses)}
                      sub={t("dashboard.expense_breakdown", {
                        stock: fmt(metrics?.stockExpenses ?? 0),
                        other: fmt(metrics?.customExpenses ?? 0),
                      })}
                      tone="warning"
                      icon="trending-down-outline"
                    />
                  </View>
                  <View className="flex-row mx-4 mb-3">
                    <StatTile
                      label={t("dashboard.net_income")}
                      value={
                        netIncome < 0
                          ? `−${fmt(Math.abs(netIncome))}`
                          : fmt(netIncome)
                      }
                      sub={t("dashboard.net_sub", {
                        income: fmt(monthlyRevenue),
                        expenses: fmt(monthlyExpenses),
                      })}
                      tone={netIncome < 0 ? "danger" : "success"}
                      icon="stats-chart-outline"
                    />
                  </View>
                </>
              ) : null}

              {/* Cash collectors hold but haven't handed over yet — admin-only, when > 0 */}
              {hasWalletCash ? (
                <View className="flex-row mx-4 mb-3">
                  <StatTile
                    label={t("dashboard.cash_in_wallets")}
                    value={fmt(walletCash)}
                    sub={t("dashboard.wallet_breakdown", {
                      collectors: metrics?.walletCollectors ?? 0,
                      transactions: metrics?.walletTransactions ?? 0,
                    })}
                    tone="primary"
                    icon="wallet-outline"
                  />
                </View>
              ) : null}

              {/* Net debt still owed (all-time, not month-scoped) — only shown when > 0 */}
              {hasDebt ? (
                <View className="flex-row mx-4 mb-3">
                  <StatTile
                    label={t("dashboard.total_debt")}
                    value={fmt(metrics?.totalDebt ?? 0)}
                    sub={t("dashboard.debt_breakdown", {
                      months: fmt(metrics?.monthsDebt ?? 0),
                      sales: fmt(metrics?.salesDebt ?? 0),
                    })}
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
