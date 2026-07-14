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
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { confirm } from "@/src/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { Branch } from "@/src/core/types";
import { useBranchSlice } from "@/src/state/hooks/useBranchSlice";
import { BranchCard } from "../components/BranchCard";
import { BranchFormSheet } from "../components/BranchFormSheet";

export function BranchesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const branches = useBranchSlice((s) => s.items);
  const loading = useBranchSlice((s) => s.loading);
  const error = useBranchSlice((s) => s.error);
  const fetchBranches = useBranchSlice((s) => s.fetchBranches);
  const getBranches = useBranchSlice((s) => s.getBranches);
  const deleteBranch = useBranchSlice((s) => s.deleteBranch);
  const bulkDeleteBranches = useBranchSlice((s) => s.bulkDeleteBranches);
  const reactivateBranch = useBranchSlice((s) => s.reactivateBranch);
  const clearError = useBranchSlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [menuBranch, setMenuBranch] = useState<Branch | null>(null);
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
    getBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(branch: Branch) {
    setEditing(branch);
    setFormVisible(true);
  }

  async function handleDeactivateBranch(branch: Branch) {
    const ok = await confirm({
      title: t("branches.deactivate_title"),
      message: t("branches.deactivate_message", { name: branch.name }),
      destructive: true,
    });
    if (!ok) return;
    await deleteBranch(branch.id);
  }

  async function handleDeleteBranch(branch: Branch) {
    const ok = await confirm({
      title: t("branches.delete_title"),
      message: t("branches.delete_message", { name: branch.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteBranch(branch.id);
  }

  function buildMenuActions(branch: Branch | null): ActionMenuItem[] {
    if (!branch) return [];
    const items: ActionMenuItem[] = [
      {
        key: "edit",
        label: t("common.edit"),
        icon: "create-outline",
        onPress: () => openEdit(branch),
      },
    ];
    if (branch.active) {
      items.push({
        key: "deactivate",
        label: t("branches.deactivate"),
        icon: "pause-circle-outline",
        destructive: true,
        onPress: () => void handleDeactivateBranch(branch),
      });
    } else {
      items.push({
        key: "reactivate",
        label: t("branches.reactivate"),
        icon: "play-circle-outline",
        onPress: () => reactivateBranch(branch.id),
      });
    }
    items.push({
      key: "delete",
      label: t("common.delete"),
      icon: "trash-outline",
      destructive: true,
      onPress: () => void handleDeleteBranch(branch),
    });
    return items;
  }

  const activeCount = branches.filter((b) => b.active).length;

  // Resolve selected ids against the VISIBLE list.
  const selectedBranches = branches.filter((b) => selectedIds.has(b.id));

  async function runBulkDelete(selected: Branch[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      await handleDeleteBranch(selected[0]);
      clearSelection();
      return;
    }
    const ok = await confirm({
      title: t("branches.bulk_delete_title", { count: selected.length }),
      message: t("branches.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await bulkDeleteBranches(selected.map((b) => b.id));
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
  }

  // Toolbar actions for the selection header. 1 selected → edit + deactivate
  // (active) / reactivate (inactive) + delete; >1 → delete only.
  function buildSelectionActions(selected: Branch[]): SelectionAction[] {
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
      if (one.active) {
        actions.push({
          key: "deactivate",
          icon: "pause-circle-outline",
          label: t("branches.deactivate"),
          destructive: true,
          onPress: () =>
            void handleDeactivateBranch(one).then(clearSelection),
        });
      } else {
        actions.push({
          key: "reactivate",
          icon: "play-circle-outline",
          label: t("branches.reactivate"),
          onPress: () => void reactivateBranch(one.id).then(clearSelection),
        });
      }
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
        title={t("branches.section_title")}
        subtitle={t("branches.count", { count: activeCount })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedBranches),
          onClose: clearSelection,
          allSelected:
            branches.length > 0 && selectedBranches.length === branches.length,
          onToggleAll: () => toggleManySelect(branches.map((b) => b.id)),
        }}
      />

      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && branches.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={branches}
          keyExtractor={(b) => b.id}
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
                fetchBranches();
              }}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <BranchCard
              branch={item}
              onEdit={openEdit}
              onMenu={setMenuBranch}
              selectionMode={selectionActive}
              selected={selectedIds.has(item.id)}
              onToggleSelect={(b) => toggleSelect(b.id)}
              onEnterSelection={(b) => enterSelection(b.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t("branches.no_branches")}
              subMessage={t("branches.no_branches_hint")}
              actionLabel={t("branches.add_branch")}
              onAction={openCreate}
            />
          }
        />
      )}

      {!selectionActive && (
        <FAB
          onPress={openCreate}
          accessibilityLabel={t("branches.add_branch")}
        />
      )}

      {formVisible && (
        <BranchFormSheet
          branch={editing}
          onDismiss={() => {
            setFormVisible(false);
            setEditing(null);
          }}
          onRequestDelete={(branch) => void handleDeleteBranch(branch)}
        />
      )}

      <ActionMenu
        visible={menuBranch !== null}
        title={menuBranch?.name}
        actions={buildMenuActions(menuBranch)}
        onDismiss={() => setMenuBranch(null)}
      />
    </SafeAreaView>
  );
}
