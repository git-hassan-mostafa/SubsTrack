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
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { UserCard } from "../components/UserCard";
import { UserFormSheet } from "../components/UserFormSheet";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";

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
  const [formVisible, setFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [menuUser, setMenuUser] = useState<AppUser | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

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
    const isOwnAccount = user.id === currentUser.id;
    const canManage =
      !isOwnAccount &&
      (currentUser.role === "superadmin" ||
        (currentUser.role === "admin" && user.role === "user"));
    const items: ActionMenuItem[] = [
      {
        key: "edit",
        label: t("common.edit"),
        icon: "create-outline",
        onPress: () => openEdit(user),
      },
    ];
    if (canManage) {
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

      {loading && users.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchUsers}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) =>
            currentUser ? (
              <UserCard user={item} onEdit={openEdit} onMenu={setMenuUser} />
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
