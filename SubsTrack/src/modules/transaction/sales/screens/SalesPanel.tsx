import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  SelectionBar,
  type SelectionAction,
} from "@/src/shared/components/SelectionBar";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import { FilterToggleButton } from "@/src/shared/components/FilterToggleButton";
import { groupByMonth } from "@/src/shared/lib/monthSections";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { CustomerPicker } from "@/src/modules/customer/customers";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import type { Sale } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { SaleCard } from "../components/SaleCard";
import { SaleFormSheet } from "../components/SaleFormSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { useSaleActions } from "../hooks/useSaleActions";
import { useSaleInvoiceAction } from "../hooks/useSaleInvoiceAction";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useAuth } from "@/src/modules/authentication/auth";

// The Sales segment of the Transactions hub. Owns its body (search, filters, list,
// FAB, sheets, selection) but not the page chrome — the parent TransactionsScreen
// provides the SafeAreaView, title, and the segmented tab switcher.
export function SalesPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sales = useSaleSlice((s) => s.items);
  const monthlyTotals = useSaleSlice((s) => s.monthlyTotals);
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
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const branchFilter = useEffectiveBranchFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  // The sale the form is correcting (see openEdit).
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);
  const selection = useSelection();
  const {
    active: selectionActive,
    selectedIds,
    toggle: toggleSelect,
    toggleMany: toggleManySelect,
    enterWith: enterSelection,
    clear: clearSelection,
  } = selection;
  useSelectionBackHandler(selectionActive, clearSelection);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  // Every per-sale action (receipt / edit / send / history / void) lives in one
  // hook, so all three sales surfaces offer the same menu.
  const saleActions = useSaleActions({
    onView: setActiveSale,
    onEdit: openEdit,
    onVoided: handleVoided,
  });

  useEffect(() => {
    clearSelection();
    fetchSales();
  }, [branchFilter, clearSelection, fetchSales]);

  // Populate the product filter dropdown (products aren't loaded by this tab otherwise).
  // `getProducts` self-guards on the slice's `loaded` flag — no length check here.
  useEffect(() => {
    void getProducts();
  }, [getProducts]);

  const productOptions: DropdownOption<string>[] = useMemo(
    () =>
      products
        .filter((p) => p.active)
        .map((p) => ({ label: p.name, value: p.id })),
    [products],
  );

  const hasActiveFilters =
    !!customerFilter || !!productFilter || !!fromDate || !!toDate;

  // Bucket the already-date-desc sales into month sections (This Month / June 2026),
  // each carrying the section's total amount collected (USD, via each row's snapshot rate).
  const sections = useMemo(
    () =>
      groupByMonth(
        sales,
        (s) => s.soldAt,
        t,
        (s) => s.amountPaid / s.ratePerUsdSnapshot,
        monthlyTotals,
      ),
    [sales, t, monthlyTotals],
  );

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch, setSearchQuery]);

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

  // The receipt closes as the form opens — two stacked full sheets are a maze.
  function openEdit(sale: Sale) {
    setActiveSale(null);
    setEditingSale(sale);
  }

  const selectedSales = sales.filter((s) => selectedIds.has(s.id));
  const invoiceAction = useSaleInvoiceAction(selectedSales, clearSelection);

  // Selection toolbar: one receipt covering the selected sales, plus a "void"
  // action that opens the shared-reason sheet for every selected sale.
  function buildSelectionActions(selected: Sale[]): SelectionAction[] {
    if (selected.length === 0) return [];
    return [
      ...(invoiceAction ? [invoiceAction] : []),
      {
        key: "void",
        icon: "close-circle-outline",
        label: t("sales.void_sale"),
        destructive: true,
        onPress: () => saleActions.requestVoid(selected),
      },
    ];
  }

  function handleVoided(result: { ok: number; failed: number }) {
    clearSelection();
    if (result.failed > 0) {
      setBulkNotice(
        t("common.bulk_void_summary", {
          ok: result.ok,
          failed: result.failed,
        }),
      );
    }
  }

  return (
    <View className="flex-1">
      <ResponsiveContainer className="flex-1">
        {/* Search + filters hide while selecting; the single selection toolbar
            takes over. */}
        {!selectionActive ? (
          <View className="px-4 gap-y-2">
            <View className="flex-row items-center gap-x-2">
              <View className="flex-1">
                <SearchTextBox
                  searchText={searchText}
                  setSearchText={setSearchText}
                  placeholder={t("sales.search_placeholder")}
                />
              </View>
              <FilterToggleButton
                active={filtersOpen}
                hasActiveFilters={hasActiveFilters}
                onPress={() => setFiltersOpen((v) => !v)}
              />
            </View>
            {filtersOpen ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                className="-mx-4"
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  gap: 8,
                  alignItems: "center",
                }}
              >
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
              </ScrollView>
            ) : null}
          </View>
        ) : (
          <SelectionBar
            count={selection.count}
            actions={buildSelectionActions(selectedSales)}
            onClose={clearSelection}
            allSelected={
              sales.length > 0 && selectedSales.length === sales.length
            }
            onToggleAll={() => toggleManySelect(sales.map((s) => s.id))}
          />
        )}

        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}
        {bulkNotice ? (
          <View className="px-4 pt-4">
            <ErrorBanner
              message={bulkNotice}
              onDismiss={() => setBulkNotice(null)}
            />
          </View>
        ) : null}

        {loading && sales.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(s) => s.id}
            stickySectionHeadersEnabled={false}
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
            renderSectionHeader={({ section }) => (
              <MonthSectionHeader
                title={section.title}
                count={section.data.length}
                first={section.key === sections[0]?.key}
                total={formatMoney(
                  section.totalUsd ?? 0,
                  null,
                  displayCurrency,
                )}
              />
            )}
            ListFooterComponent={
              loadingMore ? (
                <View className="py-4 items-center">
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <SaleCard
                sale={item}
                onPress={setActiveSale}
                onMenu={saleActions.openMenu}
                selectionMode={selectionActive}
                selected={selectedIds.has(item.id)}
                onToggleSelect={(s) => toggleSelect(s.id)}
                onEnterSelection={(s) => enterSelection(s.id)}
              />
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

        {!selectionActive && (
          <FAB
            onPress={() => setFormOpen(true)}
            accessibilityLabel={t("sales.record_button")}
          />
        )}
      </ResponsiveContainer>

      {formOpen && (
        <SaleFormSheet
          onDismiss={() => setFormOpen(false)}
          onCreated={fetchSales}
        />
      )}

      {editingSale && (
        <SaleFormSheet
          sale={editingSale}
          onDismiss={() => setEditingSale(null)}
          // Refetch, not just the slice's in-place swap: the edit can change the
          // amount collected, and the month section totals are a separate query.
          onUpdated={fetchSales}
        />
      )}

      <SaleDetailSheet
        sale={activeSale}
        onDismiss={() => setActiveSale(null)}
        onVoid={handleVoid}
        onEdit={openEdit}
        voidLoading={voidLoading}
      />

      {saleActions.sheets}
    </View>
  );
}
