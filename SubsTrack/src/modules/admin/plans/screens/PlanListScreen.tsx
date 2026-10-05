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
import { confirm } from "@shared/shared/lib/confirm";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import type { Plan } from "@shared/core/types";
import { useHistoryDoor } from "@/src/modules/admin/audit";
import {
  toActionMenuItems,
  toSelectionActions,
} from "@/src/shared/lib/menuActions";
import { CATALOG_ACTION_ICONS } from "@/src/shared/lib/catalogActionIcons";
import {
  catalogRowActions,
  catalogSelectionActions,
} from "@shared/shared/lib/catalogMenu";
import { PlanCard } from "../components/PlanCard";
import { PlanFormSheet } from "../components/PlanFormSheet";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { useSelection } from "@shared/shared/hooks/useSelection";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";

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
  const history = useHistoryDoor("plans");
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

  useEffect(() => {
    clearSelection();
    fetchPlans();
  }, [branchFilter, clearSelection, fetchPlans]);

  function openCreate() {
    setEditingPlan(null);
    setFormVisible(true);
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan);
    setFormVisible(true);
  }

  async function handleDeletePlan(plan: Plan): Promise<boolean> {
    let deleted = false;
    await confirm({
      title: t("plans.delete_title"),
      message: t("plans.delete_message", { name: plan.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        await deletePlan(plan.id);
        deleted = true;
      },
    });
    if (deleted) setFormVisible(false);
    return deleted;
  }

  function buildMenuActions(plan: Plan | null): ActionMenuItem[] {
    if (!plan) return [];
    return toActionMenuItems(catalogRowActions("plan", plan), t, {
      icons: CATALOG_ACTION_ICONS,
      run: {
      edit: () => openEdit(plan),
      history: () => history.open(plan.id, plan.name),
      delete: () => void handleDeletePlan(plan),
      },
    });
  }

  const filtered = debouncedSearch
    ? plans.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : plans;

  const {
    iconActions: exportIconActions,
    exportError,
    clearExportError,
  } = useExportRows("plans.title", filtered);

  const selectedPlans = filtered.filter((p) => selectedIds.has(p.id));

  async function runBulkDelete(selected: Plan[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      if (await handleDeletePlan(selected[0])) clearSelection();
      return;
    }
    let deleted = false;
    await confirm({
      title: t("plans.bulk_delete_title", { count: selected.length }),
      message: t("plans.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await bulkDeletePlans(selected.map((p) => p.id));
          deleted = true;
        } finally {
          setBulkBusy(false);
        }
      },
    });
    if (deleted) clearSelection();
  }

  function buildSelectionActions(selected: Plan[]): SelectionAction[] {
    const one = selected.length === 1 ? selected[0] : null;
    return toSelectionActions(catalogSelectionActions("plan", selected), t, {
      icons: CATALOG_ACTION_ICONS,
      disabled: bulkBusy ? ["delete"] : [],
      run: {
        edit: () => {
          if (one) openEdit(one);
          clearSelection();
        },
        delete: () => void runBulkDelete(selected),
      },
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        iconActions={exportIconActions}
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
        {exportError ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={exportError} onDismiss={clearExportError} />
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

      {history.sheet}
    </SafeAreaView>
  );
}
