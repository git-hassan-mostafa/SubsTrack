import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import type { Plan } from "@/src/core/types";
import { PlanCard } from "../components/PlanCard";
import { PlanFormSheet } from "../components/PlanFormSheet";
import { usePlanStore } from "../store/planStore";

export function PlanListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { plans, loading, error, fetchPlans, deletePlan, clearError } =
    usePlanStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);

  useFocusEffect(
    useCallback(() => {
      fetchPlans();
    }, []),
  );

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
          <Ionicons name="chevron-back" size={22} color="#6366f1" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-bold text-gray-900">
            {t("plans.title")}
          </Text>
          <Text className="text-sm text-gray-400 mt-0.5">
            {plans.length} active
          </Text>
        </View>

        {/* Inline search */}
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2 w-36">
          <Ionicons name="search-outline" size={14} color="#9ca3af" />
          <TextInput
            className="flex-1 ms-1.5 text-sm text-gray-900"
            placeholder="Search..."
            placeholderTextColor="#9ca3af"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <Pressable
          onPress={openCreate}
          className="bg-primary rounded-full px-4 py-2"
        >
          <Text className="text-white font-semibold text-sm">
            {t("plans.add")}
          </Text>
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
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchPlans}
              tintColor="#6366f1"
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
