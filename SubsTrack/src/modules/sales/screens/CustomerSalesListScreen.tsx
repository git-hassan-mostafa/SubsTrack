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
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { Sale } from "@/src/core/types";
import { SaleCard } from "../components/SaleCard";
import { SaleFormSheet } from "../components/SaleFormSheet";
import { SaleDetailSheet } from "../components/SaleDetailSheet";
import { SaleBulkVoidSheet } from "../components/SaleBulkVoidSheet";
import { useCustomerSalesList } from "../hooks/useCustomerSalesList";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { useAuth } from "@/src/modules/auth";

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
  const [bulkVoidOpen, setBulkVoidOpen] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

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

  const selectedSales = items.filter((s) => selectedIds.has(s.id));

  function buildSelectionActions(selected: Sale[]): SelectionAction[] {
    if (selected.length === 0) return [];
    return [
      {
        key: "void",
        icon: "close-circle-outline",
        label: t("sales.void_sale"),
        destructive: true,
        onPress: () => setBulkVoidOpen(true),
      },
    ];
  }

  async function handleBulkVoided(result: { ok: number; failed: number }) {
    setBulkVoidOpen(false);
    clearSelection();
    await refresh();
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
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("sales.title")}
        subtitle={customer?.name}
        showBack
        onBack={() => router.back()}
        hideBranchSelector
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedSales),
          onClose: clearSelection,
          allSelected: items.length > 0 && selectedSales.length === items.length,
          onToggleAll: () => toggleManySelect(items.map((s) => s.id)),
        }}
      />

      <ResponsiveContainer className="flex-1">
      {/* Search stays mounted while selecting so its space remains and the list
          never jumps; the selection toolbar (with the select-all checkbox) is
          overlaid on the header instead. */}
      <SelectionOverlaySlot selecting={selectionActive}>
        <View className="px-4 pt-4">
          <SearchTextBox
            searchText={searchText}
            setSearchText={setSearchText}
            placeholder={t("sales.search_placeholder")}
          />
        </View>
      </SelectionOverlaySlot>

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
            <SaleCard
              sale={item}
              onPress={setActiveSale}
              selectionMode={selectionActive}
              selected={selectedIds.has(item.id)}
              onToggleSelect={(s) => toggleSelect(s.id)}
              onEnterSelection={(s) => enterSelection(s.id)}
            />
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

      {customer && !selectionActive && (
        <FAB
          onPress={() => setFormOpen(true)}
          accessibilityLabel={t("sales.record_button")}
        />
      )}

      </ResponsiveContainer>

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

      {bulkVoidOpen && (
        <SaleBulkVoidSheet
          saleIds={selectedSales.map((s) => s.id)}
          onVoided={handleBulkVoided}
          onDismiss={() => setBulkVoidOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}
