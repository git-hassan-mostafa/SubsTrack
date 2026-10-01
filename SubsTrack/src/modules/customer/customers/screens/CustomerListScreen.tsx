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
import { confirm } from "@shared/shared/lib/confirm";
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
  WhatsAppComboIcon,
} from "@/src/modules/invoicing";
import { useWhatsAppActions } from "@/src/modules/whatsapp/hooks/useWhatsAppActions";
import { CustomerCard } from "../components/CustomerCard";
import {
  hasAnythingOwed,
  hasDebtFlag,
} from "@shared/modules/customer/customers/utils/customerFlags";
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
import {
  canQuickPay,
  fixedMonthItems,
  isMultiPlan,
} from "@shared/modules/customer/customers/utils/quickPay";
import { getStore } from "@shared/state/globalStore";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { usePaymentSlice } from "@shared/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
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
  const deactivateCustomer = useCustomerSlice((s) => s.deactivateCustomer);
  const reactivateCustomer = useCustomerSlice((s) => s.reactivateCustomer);
  const deleteCustomer = useCustomerSlice((s) => s.deleteCustomer);
  const bulkDeleteCustomers = useCustomerSlice((s) => s.bulkDeleteCustomers);
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
  const { canSend, openChat } = useWhatsApp();
  const whatsappActions = useWhatsAppActions();
  const { writeOffAll } = useDebtRowActions();
  const displayCurrencyId = useDisplayCurrencyId();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
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
  const [bulkBusy, setBulkBusy] = useState(false);
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

  const busy = bulkBusy || quickPay.bulkBusy;

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

  async function handleToggleActiveCustomer(customer: Customer) {
    await confirm({
      title: customer.active
        ? t("customers.deactivate_title")
        : t("customers.reactivate_title"),
      message: customer.active
        ? t("customers.deactivate_message", { name: customer.name })
        : t("customers.reactivate_message", { name: customer.name }),
      destructive: customer.active,
      onConfirm: async () => {
        if (customer.active) {
          await deactivateCustomer(customer);
        } else {
          await reactivateCustomer(customer);
        }
      },
    });
  }

  async function handleDeleteCustomer(customer: Customer): Promise<boolean> {
    let deleted = false;
    await confirm({
      title: t("customers.delete_title"),
      message: t("customers.delete_message", { name: customer.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        await deleteCustomer(customer);
        deleted = true;
      },
    });
    return deleted;
  }

  async function runBulkDelete(selected: Customer[]) {
    if (busy || selected.length === 0) return;
    if (selected.length === 1) {
      if (await handleDeleteCustomer(selected[0])) clearSelection();
      return;
    }
    let deleted = false;
    await confirm({
      title: t("customers.bulk_delete_title", { count: selected.length }),
      message: t("customers.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await bulkDeleteCustomers(selected);
          deleted = true;
        } finally {
          setBulkBusy(false);
        }
      },
    });
    if (deleted) clearSelection();
  }

  // Edit and the active toggle only appear on a single selection.
  function buildSelectionActions(selected: Customer[]): SelectionAction[] {
    if (selected.length === 0) return [];
    const actions: SelectionAction[] = [];
    if (selected.length === 1) {
      const one = selected[0];
      actions.push({
        key: "edit",
        group: "manage",
        icon: "create-outline",
        label: t("common.edit"),
        onPress: () => {
          setEditingCustomer(one);
          clearSelection();
        },
      });
      if (isAdmin) {
        actions.push({
          key: "toggle-active",
          group: "status",
          icon: one.active ? "pause-circle-outline" : "play-circle-outline",
          label: one.active
            ? t("customers.deactivate")
            : t("customers.activate"),
          destructive: one.active,
          onPress: () =>
            void handleToggleActiveCustomer(one).then(clearSelection),
        });
      }
    }
    if (isAdmin) {
      actions.push({
        key: "delete",
        group: "danger",
        icon: "trash-outline",
        label: t("common.delete"),
        destructive: true,
        disabled: busy,
        onPress: () => void runBulkDelete(selected),
      });
    }
    actions.push({
      key: "quick-pay",
      group: "money",
      icon: "flash-outline",
      label: t("payments.quick_pay.pay_now"),
      disabled: busy,
      onPress: () => {
        if (selected.length === 1) {
          void quickPay.quickPay(quickPayTarget(selected[0]));
          clearSelection();
        } else {
          void quickPay.bulkQuickPay(selected.map(quickPayTarget));
        }
      },
    });
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
    const items: ActionMenuItem[] = [];
    const target = quickPayTarget(customer);
    if (canQuickPay(customer, target.status)) {
      items.push({
        key: "quick-pay",
        group: "money",
        label: isMultiPlan(customer)
          ? t("payments.quick_pay.pay_unpaid_plans")
          : t("payments.quick_pay.menu_label"),
        icon: "flash-outline",
        onPress: () => void quickPay.quickPay(target),
      });
      if (fixedMonthItems(customer, target.status, currencies).length > 0) {
        const sendable = canSend(customer.phoneNumber);
        items.push({
          key: "quick-pay-whatsapp",
          group: "money",
          label: t("invoice.pay_and_send_whatsapp"),
          icon: "logo-whatsapp",
          renderIcon: (size: number) => (
            <WhatsAppComboIcon variant="pay" size={size} />
          ),
          disabled: !sendable,
          caption: sendable ? undefined : t("invoice.no_phone"),
          onPress: () => void quickPay.quickPay(target, true),
        });
      }
    }
    items.push({
      key: "record-sale",
      group: "create",
      label: t("sales.record_button"),
      icon: "receipt-outline",
      iconBadge: "add",
      onPress: () => setSaleCustomer(customer),
    });
    items.push({
      key: "add-custom-debt",
      group: "create",
      label: t("debts.add_custom_debt"),
      icon: "document-text-outline",
      iconBadge: "add",
      onPress: () => setCustomDebtCustomer(customer),
    });
    if (
      hasAnythingOwed(
        customerStatuses.get(customer.id) ?? null,
        netDebtByCustomer[customer.id],
      )
    ) {
      items.push({
        key: "collect",
        group: "money",
        label: t("ledger.collect_money"),
        icon: "cash-outline",
        iconBadge: "add",
        onPress: () => void handleCollectDebt(customer),
      });
      items.push({
        key: "write-off-all",
        group: "danger",
        label: t("ledger.write_off_all"),
        caption: t("ledger.write_off_all_caption"),
        icon: "remove-circle-outline",
        destructive: true,
        onPress: () => void handleWriteOffAll(customer),
      });
    }
    if (canSend(customer.phoneNumber)) {
      items.push({
        key: "whatsapp-chat",
        group: "send",
        label: t("invoice.open_whatsapp_chat"),
        icon: "logo-whatsapp",
        onPress: () => void openChat(customer.phoneNumber),
      });
    }
    items.push({
      key: "edit",
      group: "manage",
      label: t("common.edit"),
      icon: "create-outline",
      onPress: () => setEditingCustomer(customer),
    });
    items.push({
      key: "history",
      group: "history",
      label: t("audit.customer_history_action"),
      icon: "time-outline",
      onPress: () => setHistoryCustomer(customer),
    });
    if (isAdmin) {
      items.push({
        key: "toggle-active",
        group: "status",
        label: customer.active
          ? t("customers.deactivate")
          : t("customers.activate"),
        icon: customer.active ? "pause-circle-outline" : "play-circle-outline",
        destructive: customer.active,
        onPress: () => void handleToggleActiveCustomer(customer),
      });
      items.push({
        key: "delete",
        group: "danger",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => void handleDeleteCustomer(customer),
      });
    }
    items.push(...whatsappActions.rowItems(customer));
    return items;
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
