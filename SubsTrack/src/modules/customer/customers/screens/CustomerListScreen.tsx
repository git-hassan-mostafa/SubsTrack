import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { loadAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import { COLORS } from "@/src/shared/constants";
import type { Collection, Customer, CustomerStatus } from "@shared/core/types";
import {
  useSendInvoice,
  useWhatsApp,
} from "@/src/modules/invoicing";
import { useWhatsAppActions } from "@/src/modules/whatsapp/hooks/useWhatsAppActions";
import { CustomerCard } from "../components/CustomerCard";
import { hasDebtFlag } from "@shared/modules/customer/customers/utils/customerFlags";
import {
  customerMenuItems,
  customerSelectionItems,
  type CustomerActionKey,
} from "@shared/modules/customer/customers/utils/customerMenu";
import { useCustomerStatusActions } from "@shared/modules/customer/customers/hooks/useCustomerStatusActions";
import { toActionMenuItems, toSelectionActions } from "@/src/shared/lib/menuActions";
import {
  CUSTOMER_ACTION_ICONS,
  CUSTOMER_ICON_BADGES,
  payAndSendIcon,
} from "../utils/customerActionIcons";
import {
  DEFAULT_CUSTOMER_FILTERS,
  hasCustomerFilters,
  matchesCustomerFilters,
  toCustomerFilterQuery,
  type CustomerFilters,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { useLastPaidStore } from "@shared/modules/customer/customers/state/lastPaidStore";
import { CustomerFilterChips } from "../components/CustomerFilterChips";
import { CustomerHistorySheet } from "../components/CustomerHistorySheet";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { CustomDebtFormSheet } from "@/src/modules/transaction/debts/components/CustomDebtFormSheet";
import { useDebtRowActions } from "@/src/modules/transaction/debts/hooks/useDebtRowActions";
import { useCollectSheet } from "@/src/modules/ledger";
import { useLoadOwed } from "@shared/modules/ledger/hooks/useLoadOwed";
import { useQuickPay } from "@shared/modules/customer/customers/hooks/useQuickPay";
import { getStore } from "@shared/state/globalStore";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { usePaymentSlice } from "@shared/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { formatMoney } from "@shared/core/utils/currency";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { FilterToggleButton } from "@/src/shared/components/FilterToggleButton";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useSelection } from "@shared/shared/hooks/useSelection";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";
import { SaleFormSheet } from "@/src/modules/transaction/sales";

export function CustomerListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const customers = useCustomerSlice((s) => s.items);
  const activeCount = useCustomerSlice((s) => s.activeCount);
  const loading = useCustomerSlice((s) => s.loading);
  const loadingMore = useCustomerSlice((s) => s.loadingMore);
  const hasMore = useCustomerSlice((s) => s.hasMore);
  const error = useCustomerSlice((s) => s.error);
  const fetchCustomers = useCustomerSlice((s) => s.fetchCustomers);
  const fetchMoreCustomers = useCustomerSlice((s) => s.fetchMoreCustomers);
  const setSearchQuery = useCustomerSlice((s) => s.setSearchQuery);
  const clearError = useCustomerSlice((s) => s.clearError);
  const customerStatuses = usePaymentSlice((s) => s.customerStatuses);
  const fetchCustomerStatuses = usePaymentSlice((s) => s.fetchCustomerStatuses);
  const syncCustomerStatus = usePaymentSlice((s) => s.syncCustomerStatus);
  const paymentError = usePaymentSlice((s) => s.error);
  const clearPaymentError = usePaymentSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const netDebtByCustomer = useLedgerSlice((s) => s.netByCustomer);
  const fetchNetDebtByCustomer = useLedgerSlice((s) => s.fetchNetByCustomer);
  const lastPaidByCustomer = useLastPaidStore((s) => s.byCustomer);
  const fetchLastPaid = useLastPaidStore((s) => s.fetchLastPaid);
  const loadOwed = useLoadOwed();
  const { sendCollectionInvoice } = useSendInvoice();
  const { openChat } = useWhatsApp();
  const whatsappActions = useWhatsAppActions();
  const { writeOffAll } = useDebtRowActions();
  const customerStatus = useCustomerStatusActions();
  const displayCurrency = useDisplayCurrency();
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<CustomerFilters>(
    DEFAULT_CUSTOMER_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuCustomer, setMenuCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customDebtCustomer, setCustomDebtCustomer] = useState<Customer | null>(
    null,
  );
  const [collectBusyId, setCollectBusyId] = useState<string | null>(null);
  const [saleCustomer, setSaleCustomer] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
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
  const debouncedSearch = useDebounce(searchText);
  const narrowed = !!debouncedSearch || hasCustomerFilters(filters);
  const branchFilter = useEffectiveBranchFilter();

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch]);

  useEffect(() => {
    clearSelection();
    fetchCustomers();
    void fetchNetDebtByCustomer();
  }, [branchFilter, clearSelection, fetchCustomers, fetchNetDebtByCustomer]);

  useFocusEffect(
    useCallback(() => {
      void fetchCustomerStatuses(customers);
      void fetchNetDebtByCustomer();
      void fetchLastPaid();
    }, [customers, fetchCustomerStatuses, fetchNetDebtByCustomer, fetchLastPaid]),
  );

  const filterQuery = useMemo(() => toCustomerFilterQuery(filters), [filters]);

  const applyFilters = useCallback(
    (list: Customer[], statuses: Map<string, CustomerStatus>) =>
      list.filter((c) =>
        matchesCustomerFilters(
          c,
          {
            status: statuses.get(c.id) ?? null,
            debtUsd: netDebtByCustomer[c.id],
            lastPaidAt: lastPaidByCustomer.get(c.id),
          },
          filterQuery,
        ),
      ),
    [filterQuery, netDebtByCustomer, lastPaidByCustomer],
  );

  const filtered = useMemo(
    () => applyFilters(customers, customerStatuses),
    [applyFilters, customers, customerStatuses],
  );

  const filterRef = useRef(applyFilters);
  filterRef.current = applyFilters;

  const loadAllCustomers = useCallback(async () => {
    const all = await loadAllPages(
      () => getStore().getState().customers.items,
      () => getStore().getState().customers.hasMore,
      fetchMoreCustomers,
    );
    await fetchCustomerStatuses(all as Customer[]);
    const state = getStore().getState();
    return filterRef.current(
      state.customers.items,
      state.payments.customerStatuses,
    );
  }, [fetchMoreCustomers, fetchCustomerStatuses]);

  const {
    iconActions: exportIconActions,
    exportError,
    clearExportError,
    exportSheet,
  } = useExportRows("customers.title", filtered, {
    loadMore: { hasMore, loadAll: loadAllCustomers },
  });

  const selectedCustomers = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.id)),
    [filtered, selectedIds],
  );

  const handleToggleSelect = useCallback(
    (c: Customer) => toggleSelect(c.id),
    [toggleSelect],
  );
  const handleEnterSelection = useCallback(
    (c: Customer) => enterSelection(c.id),
    [enterSelection],
  );

  const openDetail = useCallback(
    (customer: Customer) => {
      router.push(`/(app)/(tabs)/customers/${customer.id}`);
    },
    [router],
  );

  const {
    open: openCollectSheet,
    openOne: openOneCollect,
    sheet: collectSheet,
  } = useCollectSheet({
    onCollected: (collection) => {
      const paid = collection.customerId
        ? customers.find((c) => c.id === collection.customerId)
        : null;
      if (paid) void syncCustomerStatus(paid.id, paid.customerPlans ?? []);
      void fetchNetDebtByCustomer(branchFilter);
      void fetchLastPaid();
    },
  });

  const quickPay = useQuickPay({
    onPaid: (created: Collection[]) => {
      clearSelection();
      for (const customerId of new Set(created.map((c) => c.customerId))) {
        const paid = customers.find((c) => c.id === customerId);
        if (paid) void syncCustomerStatus(paid.id, paid.customerPlans ?? []);
      }
      void fetchNetDebtByCustomer(branchFilter);
      void fetchLastPaid();
    },
    onTypeOne: (customer, item) => openOneCollect(customer.name, item),
    onTypeMany: (customer) =>
      router.push({
        pathname: "/(app)/(tabs)/customers/[id]",
        params: { id: customer.id, quickPay: "1" },
      }),
    sendReceipt: (customer, collection) =>
      sendCollectionInvoice({
        phone: customer.phoneNumber,
        customerName: customer.name,
        collection,
      }),
    onNotice: setBulkNotice,
  });

  const busy = customerStatus.busy || quickPay.bulkBusy;

  const quickPayTarget = (customer: Customer) => ({
    customer,
    status: customerStatuses.get(customer.id) ?? null,
  });

  const openMenu = useCallback((customer: Customer) => {
    setMenuCustomer(customer);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => {
      const status = customerStatuses.get(item.id) ?? null;
      const debtUsd = netDebtByCustomer[item.id] ?? 0;
      const debtLabel = hasDebtFlag(debtUsd)
        ? formatMoney(debtUsd, null, displayCurrency)
        : null;
      return (
        <CustomerCard
          customer={item}
          status={status}
          debtLabel={debtLabel}
          onPress={openDetail}
          onMenu={openMenu}
          menuLoading={
            quickPay.busyCustomerId === item.id || collectBusyId === item.id
          }
          selectionMode={selectionActive}
          selected={selectedIds.has(item.id)}
          onToggleSelect={handleToggleSelect}
          onEnterSelection={handleEnterSelection}
        />
      );
    },
    [
      customerStatuses,
      netDebtByCustomer,
      displayCurrency,
      openDetail,
      openMenu,
      quickPay.busyCustomerId,
      collectBusyId,
      selectionActive,
      selectedIds,
      handleToggleSelect,
      handleEnterSelection,
    ],
  );

  async function runBulkDelete(selected: Customer[]) {
    if (busy || selected.length === 0) return;
    if ((await customerStatus.remove(selected)).removed) clearSelection();
  }

  function selectionRun(
    selected: Customer[],
  ): Partial<Record<CustomerActionKey, () => void>> {
    const one = selected.length === 1 ? selected[0] : null;
    return {
      edit: () => {
        if (one) setEditingCustomer(one);
        clearSelection();
      },
      deactivate: () =>
        one && void customerStatus.toggleActive(one).then(clearSelection),
      reactivate: () =>
        one && void customerStatus.toggleActive(one).then(clearSelection),
      delete: () => void runBulkDelete(selected),
      quick_pay: () => {
        if (one) {
          void quickPay.quickPay(quickPayTarget(one));
          clearSelection();
        } else {
          void quickPay.bulkQuickPay(selected.map(quickPayTarget));
        }
      },
    };
  }

  function buildSelectionActions(selected: Customer[]): SelectionAction[] {
    const actions = toSelectionActions(
      customerSelectionItems(selected, { isAdmin }),
      t,
      {
        icons: CUSTOMER_ACTION_ICONS,
        run: selectionRun(selected),
        disabled: busy ? ["delete", "quick_pay"] : [],
      },
    );
    const whatsappAction = whatsappActions.selectionAction(selected);
    if (whatsappAction) actions.push(whatsappAction);
    return actions;
  }

  // Collect everything a customer owes — waterfall settles it oldest-first.
  async function handleCollectDebt(customer: Customer) {
    setCollectBusyId(customer.id);
    try {
      const owed = await loadOwed(customer);
      if (!owed) return;
      if (owed.length === 0) {
        setBulkNotice(t("ledger.nothing_owed"));
        return;
      }
      openCollectSheet(customer.id, customer.name, owed);
    } finally {
      setCollectBusyId(null);
    }
  }

  async function handleWriteOffAll(customer: Customer) {
    setCollectBusyId(customer.id);
    try {
      const owed = await loadOwed(customer);
      if (!owed) return;
      const billed = owed.filter((i) => !!i.chargeId);
      if (billed.length === 0) {
        setBulkNotice(t("ledger.nothing_to_write_off"));
        return;
      }
      if (!(await writeOffAll(customer.name, billed))) return;
      void syncCustomerStatus(customer.id, customer.customerPlans ?? []);
      void fetchNetDebtByCustomer(branchFilter);
    } finally {
      setCollectBusyId(null);
    }
  }

  function buildMenuActions(customer: Customer | null): ActionMenuItem[] {
    if (!customer) return [];
    const target = quickPayTarget(customer);
    const items = toActionMenuItems(
      customerMenuItems(
        customer,
        {
          status: target.status,
          debtUsd: netDebtByCustomer[customer.id],
          currencies,
        },
        { isAdmin },
      ),
      t,
      {
        icons: CUSTOMER_ACTION_ICONS,
        iconBadges: CUSTOMER_ICON_BADGES,
        renderIcons: { quick_pay_whatsapp: payAndSendIcon },
        run: {
          quick_pay: () => void quickPay.quickPay(target),
          quick_pay_whatsapp: () => void quickPay.quickPay(target, true),
          record_sale: () => setSaleCustomer(customer),
          add_custom_debt: () => setCustomDebtCustomer(customer),
          collect: () => void handleCollectDebt(customer),
          write_off_all: () => void handleWriteOffAll(customer),
          whatsapp_chat: () => void openChat(customer.phoneNumber),
          edit: () => setEditingCustomer(customer),
          history: () => setHistoryCustomer(customer),
          deactivate: () => void customerStatus.toggleActive(customer),
          reactivate: () => void customerStatus.toggleActive(customer),
          delete: () => void customerStatus.remove([customer]),
        },
      },
    );
    return [...items, ...whatsappActions.rowItems(customer)];
  }

  const listElement = useMemo(
    () => (
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 96,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              clearSelection();
              fetchCustomers();
              void fetchNetDebtByCustomer();
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
              narrowed
                ? t("customers.no_search_results")
                : t("customers.no_customers_hint")
            }
            actionLabel={
              !narrowed && customers.length === 0
                ? t("customers.create_first_customer")
                : undefined
            }
            onAction={
              !narrowed && customers.length === 0
                ? () => setFormVisible(true)
                : undefined
            }
          />
        }
      />
    ),
    [
      filtered,
      loading,
      loadingMore,
      renderItem,
      t,
      narrowed,
      customers.length,
      clearSelection,
      fetchCustomers,
      fetchNetDebtByCustomer,
      fetchMoreCustomers,
    ],
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("customers.title")}
        subtitle={t("customers.active_count", { count: activeCount })}
        iconActions={exportIconActions}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedCustomers),
          onClose: clearSelection,
          allSelected:
            filtered.length > 0 && selectedCustomers.length === filtered.length,
          onToggleAll: () => toggleManySelect(filtered.map((c) => c.id)),
        }}
      />

      <ResponsiveContainer className="flex-1">
        <SelectionOverlaySlot selecting={selectionActive}>
          <View className="px-4 pt-4">
            <View className="flex-row items-center gap-x-2">
              <View className="flex-1">
                <SearchTextBox
                  searchText={searchText}
                  setSearchText={setSearchText}
                  placeholder={t("customers.search_hint")}
                />
              </View>
              <FilterToggleButton
                active={filtersOpen}
                hasActiveFilters={hasCustomerFilters(filters)}
                onPress={() => setFiltersOpen((v) => !v)}
              />
            </View>
            {filtersOpen ? (
              <CustomerFilterChips
                value={filters}
                className="mt-4"
                onChange={(next) => {
                  setFilters((current) => ({ ...current, ...next }));
                  clearSelection();
                }}
              />
            ) : null}
          </View>
        </SelectionOverlaySlot>
        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}
        {paymentError ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={paymentError} onDismiss={clearPaymentError} />
          </View>
        ) : null}
        {exportError ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={exportError} onDismiss={clearExportError} />
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

        {loading && customers.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          listElement
        )}

        {!selectionActive && (
          <FAB
            onPress={() => setFormVisible(true)}
            accessibilityLabel={t("common.add")}
          />
        )}
      </ResponsiveContainer>

      {formVisible && (
        <CustomerFormSheet onDismiss={() => setFormVisible(false)} />
      )}

      {editingCustomer && (
        <CustomerFormSheet
          customer={editingCustomer}
          onDismiss={() => setEditingCustomer(null)}
        />
      )}

      <ActionMenu
        visible={menuCustomer !== null}
        title={menuCustomer?.name}
        actions={buildMenuActions(menuCustomer)}
        onDismiss={() => setMenuCustomer(null)}
      />

      {saleCustomer && (
        <SaleFormSheet
          initialCustomer={saleCustomer}
          onDismiss={() => setSaleCustomer(null)}
          onCreated={() => void fetchNetDebtByCustomer()}
        />
      )}
      {historyCustomer && (
        <CustomerHistorySheet
          customer={historyCustomer}
          onDismiss={() => setHistoryCustomer(null)}
        />
      )}
      {customDebtCustomer && (
        <CustomDebtFormSheet
          initialCustomer={customDebtCustomer}
          onDismiss={() => setCustomDebtCustomer(null)}
        />
      )}
      {collectSheet}
      {exportSheet}
      {whatsappActions.sheet}
    </SafeAreaView>
  );
}
