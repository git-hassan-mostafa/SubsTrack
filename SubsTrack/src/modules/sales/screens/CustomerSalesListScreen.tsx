import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import type { Sale } from "@/src/core/types";
import { SaleCard } from "../components/SaleCard";
import { SaleFormSheet } from "../components/SaleFormSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { useCustomerSalesList } from "../hooks/useCustomerSalesList";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";

// Full-page list of every sale for a single customer. Reachable from the
// "Show all" button on CustomerSalesPanel. Mirrors SalesListScreen (search +
// infinite scroll + record FAB + void) but is locked to one customer and reads
// from useCustomerSalesList instead of the global sales slice.
export function CustomerSalesListScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const getCustomer = useCustomerSlice((s) => s.getCustomer);
  const customer = useCustomerSlice(
    (s) => s.items.find((c) => c.id === id) ?? null,
  );
  // Void via the canonical global slice action so the voided sale also drops
  // out of the Sales tab's cached list, not just this customer-scoped view.
  const voidSaleGlobal = useSaleSlice((s) => s.voidSale);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const { items, loading, loadingMore, hasMore, error, refresh, loadMore, clearError } =
    useCustomerSalesList(id, debouncedSearch);

  const [formOpen, setFormOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);

  // Ensure the customer is loaded for the header + record-sale prefill when the
  // page is reached without the detail screen having cached it first.
  useEffect(() => {
    if (id && !customer) void getCustomer(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleVoid(reason: string) {
    if (!activeSale || !user) return;
    setVoidLoading(true);
    try {
      await voidSaleGlobal(activeSale.id, user.id, reason);
      setActiveSale(null);
      await refresh();
    } finally {
      setVoidLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("sales.title")}
        subtitle={customer?.name}
        showBack
        onBack={() => router.back()}
        hideBranchSelector
      />

      <View className="px-4 pt-4">
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

      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 96,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={COLORS.primary}
            />
          }
          onEndReached={() => {
            if (hasMore && !loadingMore) void loadMore();
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
              message={t("sales.no_sales_for_customer")}
              actionLabel={
                !debouncedSearch ? t("sales.record_button") : undefined
              }
              onAction={!debouncedSearch ? () => setFormOpen(true) : undefined}
            />
          }
        />
      )}

      {customer && (
        <FAB
          onPress={() => setFormOpen(true)}
          accessibilityLabel={t("sales.record_button")}
        />
      )}

      {formOpen && customer && (
        <SaleFormSheet
          initialCustomer={customer}
          onDismiss={() => setFormOpen(false)}
          onCreated={refresh}
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
