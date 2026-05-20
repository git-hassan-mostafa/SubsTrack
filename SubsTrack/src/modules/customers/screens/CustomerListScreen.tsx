import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { COLORS } from "@/src/shared/constants";
import type { Customer } from "@/src/core/types";
import { CustomerCard } from "../components/CustomerCard";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { useCustomerStore } from "../store/customerStore";
import { usePaymentStore } from "../../customer-payments/store/paymentStore";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { MONTHS } from "@/src/core/constants";

type FilterTab = "all" | "unpaid" | "active" | "inactive";

export function CustomerListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    customers,
    totalCount,
    loading,
    loadingMore,
    error,
    getCustomers,
    fetchCustomers,
    fetchMoreCustomers,
    setSearchQuery,
    clearError,
  } = useCustomerStore();
  const { currentMonthPaidIds, fetchCurrentMonthPaidIds } = usePaymentStore();
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const debouncedSearch = useDebounce(searchText);

  useEffect(() => {
    getCustomers();
    fetchCurrentMonthPaidIds();
  }, []);

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch]);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return `${t(`months.${MONTHS[now.getMonth()]}`)} ${now.getFullYear()}`;
  }, [t]);

  const tabs = useMemo(() => {
    return [
      { key: "active" as FilterTab, label: t("common.active") },
      { key: "unpaid" as FilterTab, label: t("dashboard.unpaid") },
      { key: "all" as FilterTab, label: t("customers.all") },
      { key: "inactive" as FilterTab, label: t("common.inactive") },
    ];
  }, [customers, currentMonthPaidIds, t]);

  const filtered = useMemo(() => {
    if (activeTab === "active") return customers.filter((c) => c.active);
    if (activeTab === "inactive") return customers.filter((c) => !c.active);
    if (activeTab === "unpaid")
      return customers.filter(
        (c) => c.active && c.isRegular && !currentMonthPaidIds.has(c.id),
      );
    return customers;
  }, [activeTab, customers, currentMonthPaidIds]);

  const openDetail = useCallback(
    (customer: Customer) => {
      router.push(`/(app)/(tabs)/customers/${customer.id}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => (
      <CustomerCard
        customer={item}
        isPaidThisMonth={currentMonthPaidIds.has(item.id)}
        monthLabel={monthLabel}
        onPress={openDetail}
      />
    ),
    [currentMonthPaidIds, monthLabel, openDetail],
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("customers.title")}
        subtitle={t("customers.total_count", { count: totalCount })}
        actionLabel={t("common.add")}
        onAction={() => setFormVisible(true)}
      />

      <View className="px-4 pt-4">
        {/* Search */}
        <SearchTextBox
          searchText={searchText}
          setSearchText={setSearchText}
          placeholder={t("customers.search_hint")}
        />
        {/* Filter tabs */}
        <View className="flex-row gap-2 mt-4">
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`rounded-full px-3 py-1.5 ${activeTab === tab.key ? "bg-gray-900" : "bg-gray-100"}`}
            >
              <Text
                className={`text-xs font-semibold ${activeTab === tab.key ? "text-white" : "text-gray-600"}`}
              >
                {tab.label}
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
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                fetchCustomers();
                fetchCurrentMonthPaidIds();
              }}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={() => fetchMoreCustomers()}
          onEndReachedThreshold={0.3}
          renderItem={renderItem}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={COLORS.primary} className="py-4" />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={t("customers.no_customers")}
              subMessage={
                debouncedSearch
                  ? t("customers.no_search_results")
                  : t("customers.no_customers_hint")
              }
              actionLabel={
                !debouncedSearch
                  ? t("customers.create_first_customer")
                  : undefined
              }
              onAction={
                !debouncedSearch ? () => setFormVisible(true) : undefined
              }
            />
          }
        />
      )}

      {formVisible && (
        <CustomerFormSheet onDismiss={() => setFormVisible(false)} />
      )}
    </SafeAreaView>
  );
}
