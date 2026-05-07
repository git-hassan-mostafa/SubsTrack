import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import type { Plan } from '@/src/core/types';
import { PlanCard } from '../components/PlanCard';
import { PlanFormSheet } from '../components/PlanFormSheet';
import { usePlanStore } from '../store/planStore';

export function PlanListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { plans, loading, error, fetchPlans, deletePlan, clearError } = usePlanStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);

  useFocusEffect(useCallback(() => { fetchPlans(); }, []));

  function openCreate() {
    setEditingPlan(null);
    setFormVisible(true);
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan);
    setFormVisible(true);
  }

  async function confirmDelete() {
    if (!deletingPlan) return;
    await deletePlan(deletingPlan.id);
    setDeletingPlan(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} className="p-1 me-1">
            <Ionicons name="chevron-back" size={22} color="#6366f1" />
          </Pressable>
          <View>
            <Text className="text-2xl font-bold text-gray-900">{t('plans.title')}</Text>
            <Text className="text-sm text-gray-400 mt-0.5">{plans.length} active</Text>
          </View>
        </View>
        <Pressable onPress={openCreate} className="bg-primary rounded-full px-4 py-2">
          <Text className="text-white font-semibold text-sm">+ New plan</Text>
        </Pressable>
      </View>

      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && plans.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPlans} tintColor="#6366f1" />}
          renderItem={({ item }) => (
            <PlanCard plan={item} onEdit={openEdit} onDelete={setDeletingPlan} />
          )}
          ListEmptyComponent={
            <EmptyState message={t('plans.no_plans')} subMessage={t('plans.no_plans_hint')} />
          }
        />
      )}

      <PlanFormSheet
        visible={formVisible}
        plan={editingPlan}
        onDismiss={() => { setFormVisible(false); setEditingPlan(null); }}
        onRequestDelete={setDeletingPlan}
      />

      <ConfirmDialog
        visible={!!deletingPlan}
        title={t('plans.delete_title')}
        message={t('plans.delete_message', { name: deletingPlan?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeletingPlan(null)}
      />
    </SafeAreaView>
  );
}
