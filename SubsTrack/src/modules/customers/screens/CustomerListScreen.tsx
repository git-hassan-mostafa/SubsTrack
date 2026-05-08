import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { useDebounce } from '@/src/shared/hooks/useDebounce';
import type { Customer } from '@/src/core/types';
import { CustomerCard } from '../components/CustomerCard';
import { CustomerFormSheet } from '../components/CustomerFormSheet';
import { useCustomerStore } from '../store/customerStore';

type FilterTab = 'all' | 'unpaid' | 'active' | 'inactive';

export function CustomerListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { customers, currentMonthPaidIds, loading, loadingMore, error, fetchCustomers, fetchMoreCustomers, clearError } = useCustomerStore();
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const debouncedSearch = useDebounce(searchText);

  useFocusEffect(useCallback(() => { fetchCustomers(); }, []));

  const activeCount = customers.filter((c) => c.active).length;
  const inactiveCount = customers.filter((c) => !c.active).length;

  const tabs = [
    { key: 'all' as FilterTab, label: 'All', count: customers.length },
    { key: 'active' as FilterTab, label: 'Active', count: activeCount },
    { key: 'inactive' as FilterTab, label: 'Inactive', count: inactiveCount },
  ];

  const filtered = (() => {
    let base = debouncedSearch
      ? customers.filter((c) =>
          c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          (c.phoneNumber ?? '').includes(debouncedSearch) ||
          (c.address ?? '').toLowerCase().includes(debouncedSearch.toLowerCase()),
        )
      : customers;
    if (activeTab === 'active') base = base.filter((c) => c.active);
    else if (activeTab === 'inactive') base = base.filter((c) => !c.active);
    return base;
  })();

  function openDetail(customer: Customer) {
    router.push(`/(app)/(tabs)/customers/${customer.id}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="px-5 pt-5 pb-3 bg-white border-b border-gray-100">
        <View className="flex-row items-center gap-2 mb-3">
          <Text className="text-2xl font-bold text-gray-900">{t('customers.title')}</Text>
          <Text className="text-sm text-gray-400 mt-1 flex-1">{customers.length} total</Text>

          {/* Inline search */}
          <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2 w-40">
            <Ionicons name="search-outline" size={14} color="#9ca3af" />
            <TextInput
              className="flex-1 ms-1.5 text-sm text-gray-900"
              placeholder={t('customers.search_placeholder')}
              placeholderTextColor="#9ca3af"
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          <Pressable
            onPress={() => setFormVisible(true)}
            className="bg-primary rounded-full px-4 py-2"
          >
            <Text className="text-white font-semibold text-sm">+ Add</Text>
          </Pressable>
        </View>

        {/* Filter tabs */}
        <View className="flex-row gap-2">
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`rounded-full px-3 py-1.5 ${activeTab === tab.key ? 'bg-gray-900' : 'bg-gray-100'}`}
            >
              <Text className={`text-xs font-semibold ${activeTab === tab.key ? 'text-white' : 'text-gray-600'}`}>
                {tab.label}{tab.count !== undefined ? ` · ${tab.count}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
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
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCustomers} tintColor="#6366f1" />}
          onEndReached={() => { if (!debouncedSearch) fetchMoreCustomers(); }}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <CustomerCard customer={item} isPaidThisMonth={currentMonthPaidIds.has(item.id)} onPress={openDetail} />
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
