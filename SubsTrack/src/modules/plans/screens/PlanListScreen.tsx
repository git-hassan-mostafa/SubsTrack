import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import type { Plan } from "@/src/core/types";
import { PlanCard } from "../components/PlanCard";
import { PlanFormSheet } from "../components/PlanFormSheet";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { useEffectiveBranchFilter } from "@/src/shared/lib/branchFilter";

export function PlanListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const plans = usePlanSlice((s) => s.items);
  const loading = usePlanSlice((s) => s.loading);
  const error = usePlanSlice((s) => s.error);
  const fetchPlans = usePlanSlice((s) => s.fetchPlans);
  const deletePlan = usePlanSlice((s) => s.deletePlan);
  const clearError = usePlanSlice((s) => s.clearError);
  const [formVisible, setFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [menuPlan, setMenuPlan] = useState<Plan | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

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
    setFormVisible(false);
    setDeletingPlan(null);
  }

  function buildMenuActions(plan: Plan | null): ActionMenuItem[] {
    if (!plan) return [];
    return [
      {
        key: "edit",
        label: t("common.edit"),
        icon: "create-outline",
        onPress: () => openEdit(plan),
      },
      {
        key: "delete",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => setDeletingPlan(plan),
      },
    ];
  }

  const filtered = debouncedSearch
    ? plans.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : plans;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("plans.title")}
        subtitle={t("plans.active_count", { count: plans.length })}
        showBack
        onBack={() => router.back()}
        actionLabel={t("common.add")}
        onAction={openCreate}
      />

      {/* Inline search */}
      <View className="px-4 pt-4">
        <SearchTextBox searchText={searchText} setSearchText={setSearchText} />
      </View>
      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && plans.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchPlans}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <PlanCard plan={item} onEdit={openEdit} onMenu={setMenuPlan} />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t("plans.no_plans")}
              subMessage={t("plans.no_plans_hint")}
              actionLabel={!debouncedSearch ? t("plans.create_first_plan") : undefined}
              onAction={!debouncedSearch ? openCreate : undefined}
            />
          }
        />
      )}

      {formVisible && (
        <PlanFormSheet
          plan={editingPlan}
          onDismiss={() => {
            setFormVisible(false);
            setEditingPlan(null);
          }}
          onRequestDelete={setDeletingPlan}
        />
      )}

      <ActionMenu
        visible={menuPlan !== null}
        title={menuPlan?.name}
        actions={buildMenuActions(menuPlan)}
        onDismiss={() => setMenuPlan(null)}
      />

      <ConfirmDialog
        visible={!!deletingPlan}
        title={t("plans.delete_title")}
        message={t("plans.delete_message", { name: deletingPlan?.name ?? "" })}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeletingPlan(null)}
      />
    </SafeAreaView>
  );
}
