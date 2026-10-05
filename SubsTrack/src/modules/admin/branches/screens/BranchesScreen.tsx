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
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { confirm } from "@shared/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useSelection } from "@shared/shared/hooks/useSelection";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";
import type { Branch } from "@shared/core/types";
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
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
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
  const deactivateBranch = useBranchSlice((s) => s.deactivateBranch);
  const bulkDeleteBranches = useBranchSlice((s) => s.bulkDeleteBranches);
  const reactivateBranch = useBranchSlice((s) => s.reactivateBranch);
  const clearError = useBranchSlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [menuBranch, setMenuBranch] = useState<Branch | null>(null);
  const history = useHistoryDoor("branches");
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
  }, [getBranches]);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(branch: Branch) {
    setEditing(branch);
    setFormVisible(true);
  }

  async function handleDeactivateBranch(branch: Branch) {
    await confirm({
      title: t("branches.deactivate_title"),
      message: t("branches.deactivate_message", { name: branch.name }),
      destructive: true,
      onConfirm: async () => {
        await deactivateBranch(branch.id);
      },
    });
  }

  async function handleDeleteBranch(branch: Branch): Promise<boolean> {
    let deleted = false;
    await confirm({
      title: t("branches.delete_title"),
      message: t("branches.delete_message", { name: branch.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        await deleteBranch(branch.id);
        deleted = true;
      },
    });
    return deleted;
  }

  function buildMenuActions(branch: Branch | null): ActionMenuItem[] {
    if (!branch) return [];
    return toActionMenuItems(catalogRowActions("branch", branch), t, {
      icons: CATALOG_ACTION_ICONS,
      run: {
      edit: () => openEdit(branch),
      history: () => history.open(branch.id, branch.name),
      deactivate: () => void handleDeactivateBranch(branch),
      reactivate: () => void reactivateBranch(branch.id),
      delete: () => void handleDeleteBranch(branch),
      },
    });
  }

  const activeCount = branches.filter((b) => b.active).length;

  const selectedBranches = branches.filter((b) => selectedIds.has(b.id));

  async function runBulkDelete(selected: Branch[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      if (await handleDeleteBranch(selected[0])) clearSelection();
      return;
    }
    let deleted = false;
    await confirm({
      title: t("branches.bulk_delete_title", { count: selected.length }),
      message: t("branches.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await bulkDeleteBranches(selected.map((b) => b.id));
          deleted = true;
        } finally {
          setBulkBusy(false);
        }
      },
    });
    if (deleted) clearSelection();
  }

  function buildSelectionActions(selected: Branch[]): SelectionAction[] {
    const one = selected.length === 1 ? selected[0] : null;
    return toSelectionActions(catalogSelectionActions("branch", selected), t, {
      icons: CATALOG_ACTION_ICONS,
      disabled: bulkBusy ? ["delete"] : [],
      run: {
        edit: () => {
          if (one) openEdit(one);
          clearSelection();
        },
        deactivate: () =>
          one && void handleDeactivateBranch(one).then(clearSelection),
        reactivate: () =>
          one && void reactivateBranch(one.id).then(clearSelection),
        delete: () => void runBulkDelete(selected),
      },
    });
  }

  const {
    iconActions: exportIconActions,
    exportError,
    clearExportError,
  } = useExportRows("branches.section_title", branches);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        iconActions={exportIconActions}
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

      {exportError ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={exportError} onDismiss={clearExportError} />
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

      {history.sheet}
    </SafeAreaView>
  );
}
