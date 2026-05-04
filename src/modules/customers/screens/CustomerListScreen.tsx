import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { useDebounce } from '@/src/shared/hooks/useDebounce';
import type { Customer } from '@/src/core/types';
import { CustomerCard } from '../components/CustomerCard';
import { CustomerFormSheet } from '../components/CustomerFormSheet';
import { useCustomerStore } from '../store/customerStore';

export function CustomerListScreen() {
  const router = useRouter();
  const { customers, loading, loadingMore, hasMore, error, fetchCustomers, fetchMoreCustomers, clearError } = useCustomerStore();
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText);

  useEffect(() => { fetchCustomers(); }, []);

  const filtered = debouncedSearch
    ? customers.filter((c) => c.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : customers;

  function openDetail(customer: Customer) {
    router.push(`/(app)/(tabs)/customers/${customer.id}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 py-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xl font-bold text-gray-900">Customers</Text>
          <Pressable onPress={() => setFormVisible(true)} className="bg-primary rounded-lg px-4 py-2">
            <Text className="text-white font-medium text-sm">+ Add</Text>
          </Pressable>
        </View>
        <TextInput
          className="border border-gray-200 rounded-lg px-4 py-2 bg-gray-50 text-sm text-gray-900"
          placeholder="Search customers..."
          placeholderTextColor="#9ca3af"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && customers.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          onEndReached={() => { if (!debouncedSearch) fetchMoreCustomers(); }}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <CustomerCard
              customer={item}
              unpaidCount={0}
              onPress={openDetail}
            />
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#6366f1" className="py-4" /> : null}
          ListEmptyComponent={
            <EmptyState message="No customers found" subMessage={debouncedSearch ? 'Try a different search' : 'Tap "+ Add" to add your first customer'} />
          }
        />
      )}

      <CustomerFormSheet visible={formVisible} onDismiss={() => setFormVisible(false)} />
    </SafeAreaView>
  );
}
