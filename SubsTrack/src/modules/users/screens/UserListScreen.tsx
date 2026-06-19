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
import { confirm } from "@/src/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import type { AppUser } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth";
import { UserCard } from "../components/UserCard";
import { UserFormSheet } from "../components/UserFormSheet";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectAllBar } from "@/src/shared/components/SelectAllBar";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";

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
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  // A user can be managed (toggled/deleted) by the current user when it's not
  // their own account and the role hierarchy allows it.
  function canManage(target: AppUser): boolean {
    if (!currentUser || target.id === currentUser.id) return false;
    return (
      currentUser.role === "superadmin" ||
      (currentUser.role === "admin" && target.role === "user")
    );
  }

  function openCreate() {
    setEditingUser(null);
    setFormVisible(true);
  }

  function openEdit(user: AppUser) {
    setEditingUser(user);
    setFormVisible(true);
  }

  async function handleToggleActiveUser(user: AppUser) {
    if (!currentUser) return;
    const ok = await confirm({
      title: user.active ? t("users.deactivate") : t("users.activate"),
      message: user.active
        ? t("customers.deactivate_message", { name: user.fullName })
        : t("customers.reactivate_message", { name: user.fullName }),
      destructive: user.active,
    });
    if (!ok) return;
    if (user.active) {
      await deactivateUser(
        user.id,
        currentUser.id,
        currentUser.role,
        user.role,
      );
    } else {
      await activateUser(user.id, currentUser.id, currentUser.role, user.role);
    }
  }

  async function handleDeleteUser(user: AppUser) {
    if (!currentUser) return;
    const ok = await confirm({
      title: t("users.delete_title"),
      message: t("users.delete_message", { name: user.fullName }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteUser(user.id, currentUser.id, currentUser.role, user.role);
  }

  function buildMenuActions(user: AppUser | null): ActionMenuItem[] {
    if (!user || !currentUser) return [];
    const items: ActionMenuItem[] = [
      {
        key: "edit",
        label: t("common.edit"),
        icon: "create-outline",
        onPress: () => openEdit(user),
      },
    ];
    if (canManage(user)) {
      items.push({
        key: "toggle-active",
        label: user.active ? t("users.deactivate") : t("users.activate"),
        icon: user.active ? "pause-circle-outline" : "play-circle-outline",
        destructive: user.active,
        onPress: () => void handleToggleActiveUser(user),
      });
      items.push({
        key: "delete",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => void handleDeleteUser(user),
      });
    }
    return items;
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

  // Resolve selected ids against the VISIBLE list.
  const selectedUsers = filtered.filter((u) => selectedIds.has(u.id));

  // Deletes every manageable user in the selection; non-manageable ones (own
  // account / outranked) are skipped and reported.
  async function runBulkDelete(selected: AppUser[]) {
    if (bulkBusy || selected.length === 0 || !currentUser) return;
    const manageable = selected.filter(canManage);
    const skipped = selected.length - manageable.length;

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

    const ok = await confirm({
      title: t("users.bulk_delete_title", { count: manageable.length }),
      message:
        t("users.bulk_delete_message", { count: manageable.length }) +
        (skipped > 0 ? "\n\n" + t("users.bulk_delete_skipped", { count: skipped }) : ""),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await bulkDeleteUsers(
        manageable.map((u) => ({ id: u.id, role: u.role })),
        currentUser.id,
        currentUser.role,
      );
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
  }

  // Toolbar actions for the selection header. 1 selected → edit + (toggle +
  // delete when manageable); >1 → delete only.
  function buildSelectionActions(selected: AppUser[]): SelectionAction[] {
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
      if (canManage(one)) {
        actions.push({
          key: "toggle-active",
          icon: one.active ? "pause-circle-outline" : "play-circle-outline",
          label: one.active ? t("users.deactivate") : t("users.activate"),
          destructive: one.active,
          onPress: () =>
            void handleToggleActiveUser(one).then(clearSelection),
        });
      }
    }
    if (selected.some(canManage)) {
      actions.push({
        key: "delete",
        icon: "trash-outline",
        label: t("common.delete"),
        destructive: true,
        disabled: bulkBusy,
        onPress: () => void runBulkDelete(selected),
      });
    }
    return actions;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
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
        }}
      />
      {/* Search stays mounted while selecting so its space remains and the list
          never jumps; the select-all bar overlays it. */}
      <SelectionOverlaySlot
        selecting={selectionActive}
        overlay={
          <SelectAllBar
            allSelected={
              filtered.length > 0 && selectedUsers.length === filtered.length
            }
            onToggle={() => toggleManySelect(filtered.map((u) => u.id))}
          />
        }
      >
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
    </SafeAreaView>
  );
}
