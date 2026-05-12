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
import { formatCurrency, getDateLocale } from "@/src/core/utils/date";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useDashboardStore } from "../store/dashboardStore";
import { COLORS } from "@/src/shared/constants";

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { metrics, loading, error, getMetrics, fetchMetrics, clearError } =
    useDashboardStore();

  useEffect(() => {
    getMetrics();
  }, []);

  const now = new Date();
  const locale = getDateLocale(i18n.language);
  const monthLabel = t(`months.${MONTH_KEYS[now.getMonth()]}`);
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
                {formatCurrency(metrics?.monthlyRevenue ?? 0)}
              </Text>
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

            <View className="h-6" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
