import { useEffect } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { formatCurrency } from "@/src/core/utils/date";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useDashboardStore } from "../store/dashboardStore";

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export function DashboardScreen() {
  const { user } = useAuth();
  const { metrics, loading, error, getMetrics, fetchMetrics, clearError } =
    useDashboardStore();

  useEffect(() => {
    getMetrics();
  }, []);

  const now = new Date();
  const monthLabel = MONTH_NAMES[now.getMonth()];
  const year = now.getFullYear();
  const dateLabel = now.toLocaleDateString("en-US", {
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
            tintColor="#6366f1"
          />
        }
      >
        {/* Greeting */}
        <View className="px-5 pt-5 pb-4">
          <Text className="text-2xl font-bold text-gray-900">
            Hello, {user?.username ?? ""}
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
            <ActivityIndicator color="#6366f1" />
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
                {monthLabel} {year} COLLECTED
              </Text>
              <Text className="text-4xl font-bold text-white mb-1">
                {formatCurrency(metrics?.monthlyRevenue ?? 0)}
              </Text>
              <Text className="text-sm text-indigo-200 mb-3">
                {paidCustomers} of {activeCustomers} active customers ·{" "}
                {collectedPct}% collected
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
                    Unpaid
                  </Text>
                </View>
                <Text className="text-3xl font-bold text-gray-900">
                  {metrics?.unpaidThisMonth ?? 0}
                </Text>
              </View>

              <View className="flex-1 bg-white border border-gray-100 rounded-2xl p-4">
                <View className="flex-row items-center gap-1.5 mb-2">
                  <View className="w-2 h-2 rounded-full bg-success" />
                  <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    New This Month
                  </Text>
                </View>
                <Text className="text-3xl font-bold text-gray-900">
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
