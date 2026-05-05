import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import type { Plan } from '@/src/core/types';
import { PlanCard } from '../components/PlanCard';
import { PlanFormSheet } from '../components/PlanFormSheet';
import { usePlanStore } from '../store/planStore';

export function PlanListScreen() {
  const { t } = useTranslation();
  const { plans, loading, error, fetchPlans, deletePlan, clearError } = usePlanStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);

  useEffect(() => { fetchPlans(); }, []);

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
      <View className="flex-row items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">{t('plans.title')}</Text>
        <Pressable onPress={openCreate} className="bg-primary rounded-lg px-4 py-2">
          <Text className="text-white font-medium text-sm">{t('plans.add')}</Text>
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
        onDismiss={() => setFormVisible(false)}
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
