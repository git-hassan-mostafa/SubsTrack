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
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { confirm } from "@shared/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import type { AppUser } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useHistoryDoor } from "@/src/modules/admin/audit";
import {
  toActionMenuItems,
  toSelectionActions,
  type Glyph,
} from "@/src/shared/lib/menuActions";
import {
  splitManageable,
  userRowActions,
  userSelectionActions,
  type UserActionKey,
} from "@shared/modules/admin/users/utils/userMenu";
import { UserCard } from "../components/UserCard";
import { canEditUser } from "@shared/modules/admin/users/utils/userPermissions";
import { UserFormSheet } from "../components/UserFormSheet";
import { useUserSlice } from "@shared/state/hooks/useUserSlice";
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

const USER_ACTION_ICONS: Record<UserActionKey, Glyph> = {
  edit: "create-outline",
  history: "time-outline",
  deactivate: "pause-circle-outline",
  reactivate: "play-circle-outline",
  delete: "trash-outline",
};

export function UserListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const users = useUserSlice((s) => s.items);
  const loading = useUserSlice((s) => s.loading);
  const error = useUserSlice((s) => s.error);
  const fetchUsers = useUserSlice((s) => s.fetchUsers);
  const clearError = useUserSlice((s) => s.clearError);
  const deactivateUser = useUserSlice((s) => s.deactivateUser);
  const activateUser = useUserSlice((s) => s.activateUser);
  const deleteUser = useUserSlice((s) => s.deleteUser);
  const bulkDeleteUsers = useUserSlice((s) => s.bulkDeleteUsers);
  const [formVisible, setFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [menuUser, setMenuUser] = useState<AppUser | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();
  const history = useHistoryDoor("users");
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
    fetchUsers();
  }, [branchFilter, clearSelection, fetchUsers]);

  function openCreate() {
    setEditingUser(null);
    setFormVisible(true);
  }

  // A row outside the viewer's branch is readable but not writable.
  function openEdit(user: AppUser) {
    if (!currentUser || !canEditUser(currentUser, user)) {
      setMenuUser(user);
      return;
    }
    setEditingUser(user);
    setFormVisible(true);
  }

  async function handleToggleActiveUser(user: AppUser) {
    if (!currentUser) return;
    await confirm({
      title: user.active ? t("users.deactivate") : t("users.activate"),
      message: user.active
        ? t("customers.deactivate_message", { name: user.fullName })
        : t("customers.reactivate_message", { name: user.fullName }),
      destructive: user.active,
      onConfirm: async () => {
        if (user.active) {
          await deactivateUser(
            user.id,
            currentUser.id,
            currentUser.role,
            user.role,
          );
        } else {
          await activateUser(
            user.id,
            currentUser.id,
            currentUser.role,
            user.role,
          );
        }
      },
    });
  }

  async function handleDeleteUser(user: AppUser) {
    if (!currentUser) return;
    await confirm({
      title: t("users.delete_title"),
      message: t("users.delete_message", { name: user.fullName }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        await deleteUser(user.id, currentUser.id, currentUser.role, user.role);
      },
    });
  }

  function runFor(user: AppUser): Record<UserActionKey, () => void> {
    return {
      edit: () => openEdit(user),
      history: () => history.open(user.id, user.fullName),
      deactivate: () => void handleToggleActiveUser(user),
      reactivate: () => void handleToggleActiveUser(user),
      delete: () => void handleDeleteUser(user),
    };
  }

  function buildMenuActions(user: AppUser | null): ActionMenuItem[] {
    if (!user || !currentUser) return [];
    return toActionMenuItems(userRowActions(currentUser, user), t, {
      icons: USER_ACTION_ICONS,
      run: runFor(user),
    });
  }

  const adminCount = users.filter(
    (u) => u.role === "admin" || u.role === "superadmin",
  ).length;

  const filtered = debouncedSearch
    ? users.filter(
        (u) =>
          u.username.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          u.fullName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          (u.phoneNumber ?? "").includes(debouncedSearch),
      )
    : users;

  const {
    iconActions: exportIconActions,
    exportError,
    clearExportError,
  } = useExportRows("users.title", filtered);

  const selectedUsers = filtered.filter((u) => selectedIds.has(u.id));

  // Deletes every manageable user in the selection; non-manageable ones (own
  // account / outranked) are skipped and reported.
  async function runBulkDelete(selected: AppUser[]) {
    if (bulkBusy || selected.length === 0 || !currentUser) return;
    const { manageable, skipped } = splitManageable(currentUser, selected);

    if (manageable.length === 0) {
      await confirm({
        title: t("users.delete_title"),
        message: t("users.bulk_delete_none"),
        confirmLabel: t("common.ok"),
        hideCancel: true,
      });
      return;
    }

    if (manageable.length === 1 && skipped === 0) {
      await handleDeleteUser(manageable[0]);
      clearSelection();
      return;
    }

    let deleted = false;
    await confirm({
      title: t("users.bulk_delete_title", { count: manageable.length }),
      message:
        t("users.bulk_delete_message", { count: manageable.length }) +
        (skipped > 0
          ? "\n\n" + t("users.bulk_delete_skipped", { count: skipped })
          : ""),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await bulkDeleteUsers(
            manageable.map((u) => ({ id: u.id, role: u.role })),
            currentUser.id,
            currentUser.role,
          );
          deleted = true;
        } finally {
          setBulkBusy(false);
        }
      },
    });
    if (deleted) clearSelection();
  }

  function buildSelectionActions(selected: AppUser[]): SelectionAction[] {
    if (!currentUser) return [];
    const one = selected.length === 1 ? selected[0] : null;
    return toSelectionActions(userSelectionActions(currentUser, selected), t, {
      icons: USER_ACTION_ICONS,
      disabled: bulkBusy ? ["delete"] : [],
      run: {
        edit: () => {
          if (one) openEdit(one);
          clearSelection();
        },
        deactivate: () =>
          one && void handleToggleActiveUser(one).then(clearSelection),
        reactivate: () =>
          one && void handleToggleActiveUser(one).then(clearSelection),
        delete: () => void runBulkDelete(selected),
      },
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        iconActions={exportIconActions}
        title={t("users.title")}
        subtitle={t("users.members_summary", {
          count: users.length,
          admins: adminCount,
        })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedUsers),
          onClose: clearSelection,
          allSelected:
            filtered.length > 0 && selectedUsers.length === filtered.length,
          onToggleAll: () => toggleManySelect(filtered.map((u) => u.id)),
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

        {loading && users.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
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
                  fetchUsers();
                }}
                tintColor={COLORS.primary}
              />
            }
            renderItem={({ item }) =>
              currentUser ? (
                <UserCard
                  user={item}
                  onEdit={openEdit}
                  onMenu={setMenuUser}
                  selectionMode={selectionActive}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={(u) => toggleSelect(u.id)}
                  onEnterSelection={(u) => enterSelection(u.id)}
                />
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                message={t("users.no_staff")}
                subMessage={t("users.no_staff_hint")}
                actionLabel={
                  !debouncedSearch ? t("users.create_first_staff") : undefined
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
        <UserFormSheet
          user={editingUser}
          onDismiss={() => setFormVisible(false)}
        />
      )}

      <ActionMenu
        visible={menuUser !== null}
        title={menuUser?.fullName}
        actions={buildMenuActions(menuUser)}
        onDismiss={() => setMenuUser(null)}
      />

      {history.sheet}
    </SafeAreaView>
  );
}
