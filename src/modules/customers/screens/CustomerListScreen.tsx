import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { useDebounce } from '@/src/shared/hooks/useDebounce';
import type { Customer } from '@/src/core/types';
import { CustomerCard } from '../components/CustomerCard';
import { CustomerFormSheet } from '../components/CustomerFormSheet';
import { useCustomerStore } from '../store/customerStore';

export function CustomerListScreen() {
  const { t } = useTranslation();
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
          <Text className="text-xl font-bold text-gray-900">{t('customers.title')}</Text>
          <Pressable onPress={() => setFormVisible(true)} className="bg-primary rounded-lg px-4 py-2">
            <Text className="text-white font-medium text-sm">{t('customers.add')}</Text>
          </Pressable>
        </View>
        <TextInput
          className="border border-gray-200 rounded-lg px-4 py-2 bg-gray-50 text-sm text-gray-900"
          placeholder={t('customers.search_placeholder')}
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
            <CustomerCard customer={item} unpaidCount={0} onPress={openDetail} />
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#6366f1" className="py-4" /> : null}
          ListEmptyComponent={
            <EmptyState
              message={t('customers.no_customers')}
              subMessage={debouncedSearch ? t('customers.no_search_results') : t('customers.no_customers_hint')}
            />
          }
        />
      )}

      <CustomerFormSheet visible={formVisible} onDismiss={() => setFormVisible(false)} />
    </SafeAreaView>
  );
}
