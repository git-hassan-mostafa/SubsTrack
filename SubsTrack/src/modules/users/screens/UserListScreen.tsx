import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { useDebounce } from '@/src/shared/hooks/useDebounce';
import type { AppUser } from '@/src/core/types';
import { UserCard } from '../components/UserCard';
import { UserFormSheet } from '../components/UserFormSheet';
import { useUserStore } from '../store/userStore';

export function UserListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { users, loading, error, fetchUsers, clearError } = useUserStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText);

  useFocusEffect(useCallback(() => { fetchUsers(); }, []));

  function openCreate() {
    setEditingUser(null);
    setFormVisible(true);
  }

  function openEdit(user: AppUser) {
    setEditingUser(user);
    setFormVisible(true);
  }

  const adminCount = users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length;

  const filtered = debouncedSearch
    ? users.filter((u) =>
        u.username.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (u.phoneNumber ?? '').includes(debouncedSearch),
      )
    : users;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-4 pb-4 bg-white border-b border-gray-100 gap-2">
        <Pressable onPress={() => router.back()} className="p-1 me-1">
          <Ionicons name="chevron-back" size={22} color="#6366f1" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-bold text-gray-900">{t('users.title')}</Text>
          <Text className="text-sm text-gray-400 mt-0.5">
            {users.length} members · {adminCount} admin
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

        <Pressable onPress={openCreate} className="bg-primary rounded-full px-4 py-2">
          <Text className="text-white font-semibold text-sm">+ Invite</Text>
        </Pressable>
      </View>

      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && users.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchUsers} tintColor="#6366f1" />}
          renderItem={({ item }) => <UserCard user={item} onEdit={openEdit} />}
          ListEmptyComponent={
            <EmptyState message={t('users.no_staff')} subMessage={t('users.no_staff_hint')} />
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
