import { useCallback } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { formatCurrency } from '@/src/core/utils/date';
import { MetricCard } from '../components/MetricCard';
import { useDashboardStore } from '../store/dashboardStore';

export function DashboardScreen() {
  const { metrics, loading, error, fetchMetrics, clearError } = useDashboardStore();

  useFocusEffect(
    useCallback(() => {
      fetchMetrics();
    }, []),
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 py-4 bg-white border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Dashboard</Text>
      </View>

      <ScrollView
        className="flex-1 p-4"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchMetrics} tintColor="#6366f1" />}
      >
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {loading && !metrics ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator color="#6366f1" />
          </View>
        ) : (
          <>
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Current Month
            </Text>
            <View className="flex-row gap-3 mb-3">
              <MetricCard
                label="Monthly Revenue"
                value={formatCurrency(metrics?.monthlyRevenue ?? 0)}
                color="success"
              />
              <MetricCard
                label="Unpaid"
                value={metrics?.unpaidThisMonth ?? 0}
                color={(metrics?.unpaidThisMonth ?? 0) > 0 ? 'danger' : 'default'}
              />
            </View>

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 mt-4">
              Customers
            </Text>
            <View className="flex-row gap-3">
              <MetricCard
                label="Total Customers"
                value={metrics?.totalCustomers ?? 0}
              />
              <MetricCard
                label="Active"
                value={metrics?.activeCustomers ?? 0}
                color="success"
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
