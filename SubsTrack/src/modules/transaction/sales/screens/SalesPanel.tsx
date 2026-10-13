import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import { FAB } from "@/src/shared/components/FAB";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { MonthSectionHeader } from "@/src/shared/components/MonthSectionHeader";
import type { RenderPageHeader } from "@/src/shared/components/PageHeader";
import { groupByMonth } from "@shared/shared/lib/monthSections";
import { useSelection } from "@shared/shared/hooks/useSelection";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import type { Sale } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { saleUsd } from "@shared/modules/transaction/sales/utils/saleListPatch";
import { SaleCard } from "../components/SaleCard";
import { SaleFilterFields } from "../components/SaleFilterFields";
import { SaleFormSheet } from "../components/SaleFormSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { useSaleActions } from "../hooks/useSaleActions";
import { useSaleSlice } from "@shared/state/hooks/useSaleSlice";
import { hasSaleFilter } from "@shared/modules/transaction/sales/utils/saleFilters";
import { KEYBOARD_SAFE_LIST } from "@/src/shared/lib/keyboardSafeList";

interface Props {
  header: RenderPageHeader;
}

export function SalesPanel({ header }: Props) {
  const { t } = useTranslation();
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
  const productFilter = useSaleSlice((s) => s.productFilter);
  const fromDate = useSaleSlice((s) => s.fromDate);
  const toDate = useSaleSlice((s) => s.toDate);
  const status = useSaleSlice((s) => s.status);
  const clearFilters = useSaleSlice((s) => s.clearFilters);
  const clearError = useSaleSlice((s) => s.clearError);

  const displayCurrency = useDisplayCurrency();

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [activeSale, setActiveSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
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

  const saleActions = useSaleActions({
    onView: setActiveSale,
    onEdit: openEdit,
    onVoided: handleVoided,
    onSelectionDone: clearSelection,
  });

  useEffect(() => {
    clearSelection();
    fetchSales();
  }, [branchFilter, clearSelection, fetchSales]);

  const hasActiveFilters = hasSaleFilter({
    customerId: customerFilter?.id ?? null,
    productId: productFilter?.id ?? null,
    fromDate,
    toDate,
    status,
  });

  const sections = useMemo(
    () => groupByMonth(sales, (s) => s.soldAt, t, saleUsd, monthlyTotals),
    [sales, t, monthlyTotals],
  );

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch, setSearchQuery]);

  // The receipt closes as the form opens — two stacked full sheets are a maze.
  function openEdit(sale: Sale) {
    setActiveSale(null);
    setEditingSale(sale);
  }

  const selectedSales = sales.filter((s) => selectedIds.has(s.id));


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
      {header({
        search: {
          value: searchText,
          onChange: setSearchText,
          placeholder: t("sales.search_placeholder"),
        },
        filters: {
          active: hasActiveFilters,
          onClear: clearFilters,
          children: <SaleFilterFields />,
        },
        selection: {
          active: selectionActive,
          count: selection.count,
          actions: saleActions.selectionActions(selectedSales),
          onClose: clearSelection,
          allSelected: sales.length > 0 && selectedSales.length === sales.length,
          onToggleAll: () => toggleManySelect(sales.map((s) => s.id)),
        },
      })}
      <ResponsiveContainer className="flex-1">
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
            {...KEYBOARD_SAFE_LIST}
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

      {formOpen && <SaleFormSheet onDismiss={() => setFormOpen(false)} />}

      {editingSale && (
        <SaleFormSheet
          sale={editingSale}
          onDismiss={() => setEditingSale(null)}
        />
      )}

      <SaleDetailSheet
        sale={activeSale}
        onDismiss={() => setActiveSale(null)}
        onVoided={handleVoided}
        onEdit={openEdit}
      />

      {saleActions.sheets}
    </View>
  );
}
