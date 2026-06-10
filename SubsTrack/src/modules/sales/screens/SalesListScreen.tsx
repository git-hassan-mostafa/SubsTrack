import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { CustomerPicker } from "@/src/modules/customers/components/CustomerPicker";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import type { Sale } from "@/src/core/types";
import { SaleCard } from "../components/SaleCard";
import { SaleFormSheet } from "../components/SaleFormSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";

export function SalesListScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sales = useSaleSlice((s) => s.items);
  const loading = useSaleSlice((s) => s.loading);
  const loadingMore = useSaleSlice((s) => s.loadingMore);
  const error = useSaleSlice((s) => s.error);
  const hasMore = useSaleSlice((s) => s.hasMore);
  const fetchSales = useSaleSlice((s) => s.fetchSales);
  const fetchMoreSales = useSaleSlice((s) => s.fetchMoreSales);
  const setSearchQuery = useSaleSlice((s) => s.setSearchQuery);
  const customerFilter = useSaleSlice((s) => s.customerFilter);
  const setCustomerFilter = useSaleSlice((s) => s.setCustomerFilter);
  const voidSale = useSaleSlice((s) => s.voidSale);
  const clearError = useSaleSlice((s) => s.clearError);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  useEffect(() => {
    setSearchQuery(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function handleVoid(reason: string) {
    if (!activeSale || !user) return;
    setVoidLoading(true);
    try {
      await voidSale(activeSale.id, user.id, reason);
      setActiveSale(null);
    } finally {
      setVoidLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("sales.title")}
        subtitle={t("sales.recent_count", { count: sales.length })}
      />

      <View className="px-4 pt-4">
        <CustomerPicker
          placeholder={t("sales.filter_by_customer")}
          value={customerFilter}
          onChange={setCustomerFilter}
          nullable
          nullLabel={t("sales.all_customers")}
        />
        <SearchTextBox
          searchText={searchText}
          setSearchText={setSearchText}
          placeholder={t("sales.search_placeholder")}
        />
      </View>
      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && sales.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 96,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchSales}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={() => {
            if (hasMore && !loadingMore) void fetchMoreSales();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <SaleCard sale={item} onPress={setActiveSale} />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t("sales.no_sales")}
              subMessage={t("sales.no_sales_hint")}
              actionLabel={
                !debouncedSearch && !customerFilter
                  ? t("sales.record_first_sale")
                  : undefined
              }
              onAction={
                !debouncedSearch && !customerFilter
                  ? () => setFormOpen(true)
                  : undefined
              }
            />
          }
        />
      )}

      <FAB
        onPress={() => setFormOpen(true)}
        accessibilityLabel={t("sales.record_button")}
      />

      {formOpen && (
        <SaleFormSheet
          onDismiss={() => setFormOpen(false)}
          onCreated={fetchSales}
        />
      )}

      <SaleDetailSheet
        sale={activeSale}
        onDismiss={() => setActiveSale(null)}
        onVoid={handleVoid}
        voidLoading={voidLoading}
      />
    </SafeAreaView>
  );
}
