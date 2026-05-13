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
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import type { AppUser } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { UserCard } from "../components/UserCard";
import { UserFormSheet } from "../components/UserFormSheet";
import { useUserStore } from "../store/userStore";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";

export function UserListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { users, loading, error, getUsers, fetchUsers, clearError, deactivateUser, activateUser } =
    useUserStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);

  useEffect(() => {
    getUsers();
  }, []);

  function openCreate() {
    setEditingUser(null);
    setFormVisible(true);
  }

  function openEdit(user: AppUser) {
    setEditingUser(user);
    setFormVisible(true);
  }

  async function handleToggleActive(user: AppUser) {
    if (!currentUser) return;
    if (user.active) {
      await deactivateUser(user.id, currentUser.id, currentUser.role, user.role);
    } else {
      await activateUser(user.id, currentUser.id, currentUser.role, user.role);
    }
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
              <UserCard
                user={item}
                currentUser={currentUser}
                onEdit={openEdit}
                onToggleActive={handleToggleActive}
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={t("users.no_staff")}
              subMessage={t("users.no_staff_hint")}
            />
          }
        />
      )}

      <UserFormSheet
        visible={formVisible}
        user={editingUser}
        onDismiss={() => setFormVisible(false)}
      />
    </SafeAreaView>
  );
}
