import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import type { AppUser } from '@/src/core/types';
import { UserCard } from '../components/UserCard';
import { UserFormSheet } from '../components/UserFormSheet';
import { useUserStore } from '../store/userStore';

export function UserListScreen() {
  const { users, loading, error, fetchUsers, clearError } = useUserStore();
  const [formVisible, setFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  useEffect(() => { fetchUsers(); }, []);

  function openCreate() {
    setEditingUser(null);
    setFormVisible(true);
  }

  function openEdit(user: AppUser) {
    setEditingUser(user);
    setFormVisible(true);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-900">Staff</Text>
        <Pressable onPress={openCreate} className="bg-primary rounded-lg px-4 py-2">
          <Text className="text-white font-medium text-sm">+ Add Staff</Text>
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
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          renderItem={({ item }) => <UserCard user={item} onEdit={openEdit} />}
          ListEmptyComponent={
            <EmptyState message="No staff yet" subMessage='Tap "+ Add Staff" to create one' />
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
