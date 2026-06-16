import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { CustomerPicker } from "@/src/modules/customers";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import type { Sale } from "@/src/core/types";
import { SaleCard } from "../components/SaleCard";
import { SaleFormSheet } from "../components/SaleFormSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useAuth } from "@/src/modules/auth";

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
  const productFilter = useSaleSlice((s) => s.productFilter);
  const setProductFilter = useSaleSlice((s) => s.setProductFilter);
  const fromDate = useSaleSlice((s) => s.fromDate);
  const toDate = useSaleSlice((s) => s.toDate);
  const setDateRange = useSaleSlice((s) => s.setDateRange);
  const clearFilters = useSaleSlice((s) => s.clearFilters);
  const voidSale = useSaleSlice((s) => s.voidSale);
  const clearError = useSaleSlice((s) => s.clearError);

  const products = useProductSlice((s) => s.items);
  const getProducts = useProductSlice((s) => s.getProducts);

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

  // Populate the product filter dropdown (products aren't loaded by this tab otherwise).
  useEffect(() => {
    if (products.length === 0) void getProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productOptions: DropdownOption<string>[] = useMemo(
    () =>
      products
        .filter((p) => p.active)
        .map((p) => ({ label: p.name, value: p.id })),
    [products],
  );

  const hasActiveFilters =
    !!customerFilter || !!productFilter || !!fromDate || !!toDate;

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

      <View className="px-4 pt-4 gap-y-2">
        <SearchTextBox
          searchText={searchText}
          setSearchText={setSearchText}
          placeholder={t("sales.search_placeholder")}
        />
        <View className="flex-row flex-wrap items-center gap-2">
          <CustomerPicker
            placeholder={t("sales.filter_by_customer")}
            value={customerFilter}
            onChange={setCustomerFilter}
            nullable
            nullLabel={t("sales.all_customers")}
            triggerStyle="chip"
          />
          <Dropdown<string>
            placeholder={t("sales.filter_by_product")}
            options={productOptions}
            value={productFilter?.id ?? null}
            onChange={(id) =>
              setProductFilter(products.find((p) => p.id === id) ?? null)
            }
            nullable
            nullLabel={t("sales.all_products")}
            triggerStyle="chip"
          />
          <DatePickerInput
            placeholder={t("sales.date_from")}
            value={fromDate ?? ""}
            onChange={(v) => setDateRange(v || null, toDate)}
            maxDate={toDate ?? undefined}
            triggerStyle="chip"
            clearable
          />
          <DatePickerInput
            placeholder={t("sales.date_to")}
            value={toDate ?? ""}
            onChange={(v) => setDateRange(fromDate, v || null)}
            minDate={fromDate ?? undefined}
            triggerStyle="chip"
            clearable
          />
          {hasActiveFilters ? (
            <PressableOpacity
              onPress={clearFilters}
              className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
            >
              <Ionicons name="close" size={14} color={COLORS.gray500} />
              <Text className="text-sm font-medium text-gray-500">
                {t("common.clear_filters")}
              </Text>
            </PressableOpacity>
          ) : null}
        </View>
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
                !debouncedSearch && !hasActiveFilters
                  ? t("sales.record_first_sale")
                  : undefined
              }
              onAction={
                !debouncedSearch && !hasActiveFilters
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
