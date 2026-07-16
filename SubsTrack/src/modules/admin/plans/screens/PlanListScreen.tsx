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
import { confirm } from "@/src/shared/lib/confirm";
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
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";

export function PlanListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const plans = usePlanSlice((s) => s.items);
  const loading = usePlanSlice((s) => s.loading);
  const error = usePlanSlice((s) => s.error);
  const fetchPlans = usePlanSlice((s) => s.fetchPlans);
  const deletePlan = usePlanSlice((s) => s.deletePlan);
  const bulkDeletePlans = usePlanSlice((s) => s.bulkDeletePlans);
  const clearError = usePlanSlice((s) => s.clearError);
  const [formVisible, setFormVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [menuPlan, setMenuPlan] = useState<Plan | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();
  const selection = useSelection();
  const {
    active: selectionActive,
    selectedIds,
    toggle: toggleSelect,
    toggleMany: toggleManySelect,
    enterWith: enterSelection,
    clear: clearSelection,
  } = selection;
  useSelectionBackHandler(selectionActive, clearSelection);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    clearSelection();
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

  async function handleDeletePlan(plan: Plan) {
    const ok = await confirm({
      title: t("plans.delete_title"),
      message: t("plans.delete_message", { name: plan.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deletePlan(plan.id);
    setFormVisible(false);
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
        onPress: () => void handleDeletePlan(plan),
      },
    ];
  }

  const filtered = debouncedSearch
    ? plans.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : plans;

  // Resolve selected ids against the VISIBLE list.
  const selectedPlans = filtered.filter((p) => selectedIds.has(p.id));

  async function runBulkDelete(selected: Plan[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      await handleDeletePlan(selected[0]);
      clearSelection();
      return;
    }
    const ok = await confirm({
      title: t("plans.bulk_delete_title", { count: selected.length }),
      message: t("plans.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await bulkDeletePlans(selected.map((p) => p.id));
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
  }

  // Toolbar actions for the selection header. 1 selected → edit + delete;
  // >1 → delete only.
  function buildSelectionActions(selected: Plan[]): SelectionAction[] {
    if (selected.length === 0) return [];
    const actions: SelectionAction[] = [];
    if (selected.length === 1) {
      const one = selected[0];
      actions.push({
        key: "edit",
        icon: "create-outline",
        label: t("common.edit"),
        onPress: () => {
          openEdit(one);
          clearSelection();
        },
      });
    }
    actions.push({
      key: "delete",
      icon: "trash-outline",
      label: t("common.delete"),
      destructive: true,
      disabled: bulkBusy,
      onPress: () => void runBulkDelete(selected),
    });
    return actions;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("plans.title")}
        subtitle={t("plans.active_count", { count: plans.length })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedPlans),
          onClose: clearSelection,
          allSelected:
            filtered.length > 0 && selectedPlans.length === filtered.length,
          onToggleAll: () => toggleManySelect(filtered.map((p) => p.id)),
        }}
      />

      <ResponsiveContainer className="flex-1">
      {/* Search stays mounted while selecting so its space remains and the list
          never jumps; the selection toolbar (with the select-all checkbox) is
          overlaid on the header instead. */}
      <SelectionOverlaySlot selecting={selectionActive}>
        <View className="px-4 pt-4">
          <SearchTextBox
            searchText={searchText}
            setSearchText={setSearchText}
          />
        </View>
      </SelectionOverlaySlot>
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
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 96,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                clearSelection();
                fetchPlans();
              }}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <PlanCard
              plan={item}
              onEdit={openEdit}
              onMenu={setMenuPlan}
              selectionMode={selectionActive}
              selected={selectedIds.has(item.id)}
              onToggleSelect={(p) => toggleSelect(p.id)}
              onEnterSelection={(p) => enterSelection(p.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t("plans.no_plans")}
              subMessage={t("plans.no_plans_hint")}
              actionLabel={
                !debouncedSearch ? t("plans.create_first_plan") : undefined
              }
              onAction={!debouncedSearch ? openCreate : undefined}
            />
          }
        />
      )}

      {!selectionActive && (
        <FAB onPress={openCreate} accessibilityLabel={t("common.add")} />
      )}

      </ResponsiveContainer>

      {formVisible && (
        <PlanFormSheet
          plan={editingPlan}
          onDismiss={() => {
            setFormVisible(false);
            setEditingPlan(null);
          }}
          onRequestDelete={(plan) => void handleDeletePlan(plan)}
        />
      )}

      <ActionMenu
        visible={menuPlan !== null}
        title={menuPlan?.name}
        actions={buildMenuActions(menuPlan)}
        onDismiss={() => setMenuPlan(null)}
      />
    </SafeAreaView>
  );
}
