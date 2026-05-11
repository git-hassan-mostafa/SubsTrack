import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import type { Plan } from "@/src/core/types";
import { PlanCard } from "../components/PlanCard";
import { PlanFormSheet } from "../components/PlanFormSheet";
import { usePlanStore } from "../store/planStore";
import SearchTextBox from "@/src/shared/components/SearchTextBox";

export function PlanListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    plans,
    loading,
    error,
    getPlans,
    fetchPlans,
    deletePlan,
    clearError,
  } = usePlanStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);

  useEffect(() => {
    getPlans();
  }, []);

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

  const filtered = debouncedSearch
    ? plans.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : plans;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-4 pb-4 bg-white border-b border-gray-100 gap-2">
        <Pressable onPress={() => router.back()} className="p-1 me-1">
          <DirectionalIcon name="chevron-back" size={22} color={COLORS.primary} />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text fontWeight="Bold" className="text-2xl text-gray-900">
            {t("plans.title")}
          </Text>
          <Text className="text-sm text-gray-400 mt-0.5">
            {t("plans.active_count", { count: plans.length })}
          </Text>
        </View>

        <Pressable
          onPress={openCreate}
          className="bg-primary rounded-full px-4 py-2"
        >
          <Text className="text-white font-semibold text-sm">
            {t("common.add")}
          </Text>
        </Pressable>
      </View>

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
            <PlanCard
              plan={item}
              onEdit={openEdit}
              onDelete={setDeletingPlan}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t("plans.no_plans")}
              subMessage={t("plans.no_plans_hint")}
            />
          }
        />
      )}

      <PlanFormSheet
        visible={formVisible}
        plan={editingPlan}
        onDismiss={() => {
          setFormVisible(false);
          setEditingPlan(null);
        }}
        onRequestDelete={setDeletingPlan}
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
