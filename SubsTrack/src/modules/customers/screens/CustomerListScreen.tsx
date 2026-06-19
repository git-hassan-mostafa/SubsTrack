import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { confirm } from "@/src/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { COLORS } from "@/src/shared/constants";
import {
  useGraceDays,
  useSubscriptionSlice,
} from "@/src/state/hooks/useSubscriptionSlice";
import type { Customer } from "@/src/core/types";
import { CustomerCard } from "../components/CustomerCard";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useAuth } from "../../auth/hooks/useAuth";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import {
  getCurrentYearMonth,
  getDateLocale,
  isBeforeStartDate,
  toBillingMonth,
} from "@/src/core/utils/date";
import { getBlockRangeLabel } from "../../customer-payments/utils/blockRangeLabel";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectAllBar } from "@/src/shared/components/SelectAllBar";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { MONTHS } from "@/src/core/constants";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { MultiMonthConflict } from "@/src/modules/customer-payments";

type FilterTab = "all" | "unpaid" | "active" | "inactive";

export function CustomerListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const graceDays = useGraceDays();
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const customers = useCustomerSlice((s) => s.items);
  const activeCount = useCustomerSlice((s) => s.activeCount);
  const loading = useCustomerSlice((s) => s.loading);
  const loadingMore = useCustomerSlice((s) => s.loadingMore);
  const error = useCustomerSlice((s) => s.error);
  const fetchCustomers = useCustomerSlice((s) => s.fetchCustomers);
  const fetchMoreCustomers = useCustomerSlice((s) => s.fetchMoreCustomers);
  const setSearchQuery = useCustomerSlice((s) => s.setSearchQuery);
  const clearError = useCustomerSlice((s) => s.clearError);
  const deactivateCustomer = useCustomerSlice((s) => s.deactivateCustomer);
  const reactivateCustomer = useCustomerSlice((s) => s.reactivateCustomer);
  const deleteCustomer = useCustomerSlice((s) => s.deleteCustomer);
  const bulkDeleteCustomers = useCustomerSlice((s) => s.bulkDeleteCustomers);
  const currentMonthFullyPaidIds = usePaymentSlice(
    (s) => s.currentMonthFullyPaidIds,
  );
  const currentMonthPartialIds = usePaymentSlice(
    (s) => s.currentMonthPartialIds,
  );
  const overdueCustomerIds = usePaymentSlice((s) => s.overdueCustomerIds);
  const fetchCurrentMonthPaymentStatus = usePaymentSlice(
    (s) => s.fetchCurrentMonthPaymentStatus,
  );
  const fetchOverdueStatus = usePaymentSlice((s) => s.fetchOverdueStatus);
  const createPayment = usePaymentSlice((s) => s.createPayment);
  const createMultiMonthPayment = usePaymentSlice(
    (s) => s.createMultiMonthPayment,
  );
  const bulkPayCustomers = usePaymentSlice((s) => s.bulkPayCustomers);
  const voidCurrentMonthForCustomer = usePaymentSlice(
    (s) => s.voidCurrentMonthForCustomer,
  );
  const paymentError = usePaymentSlice((s) => s.error);
  const clearPaymentError = usePaymentSlice((s) => s.clearError);
  const clearPaymentTierLimitError = usePaymentSlice(
    (s) => s.clearTierLimitError,
  );
  const currencies = useCurrencySlice((s) => s.items);
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [quickPayCustomerId, setQuickPayCustomerId] = useState<string | null>(
    null,
  );
  const [menuCustomer, setMenuCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
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
  const branchFilter = useEffectiveBranchFilter();

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch]);

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    clearSelection();
    fetchCustomers();
    fetchCurrentMonthPaymentStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  // Recomputes overdue status on focus and whenever the loaded customer set
  // changes (reload, pagination). Refreshing on focus keeps the badge correct
  // after a past month is paid from the detail panel.
  useFocusEffect(
    useCallback(() => {
      if (customers.length > 0) void fetchOverdueStatus(customers, graceDays);
    }, [customers, graceDays, fetchOverdueStatus]),
  );

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
  }, [t]);

  // A customer has *any* payment record for the current month when either set holds them.
  // Used by the unpaid tab + Quick Pay gating to mean "already has a record this month."
  const hasCurrentMonthPayment = useCallback(
    (id: string) =>
      currentMonthFullyPaidIds.has(id) || currentMonthPartialIds.has(id),
    [currentMonthFullyPaidIds, currentMonthPartialIds],
  );

  const filtered = useMemo(() => {
    if (activeTab === "active") return customers.filter((c) => c.active);
    if (activeTab === "inactive") return customers.filter((c) => !c.active);
    if (activeTab === "unpaid")
      return customers.filter(
        (c) =>
          c.active &&
          c.isRegular &&
          (overdueCustomerIds.has(c.id) || !hasCurrentMonthPayment(c.id)),
      );
    return customers;
  }, [activeTab, customers, hasCurrentMonthPayment, overdueCustomerIds]);

  // Resolve selected ids against the VISIBLE list, so a selected-then-filtered-out
  // customer can never be acted on invisibly.
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

  // Records a quick payment (single OR multi-month) for one eligible, fixed-price
  // customer. No dialogs, no per-card spinner — callers own the confirm + loading
  // UI. Multi-month throws on an already-paid-month conflict. Custom-price /
  // no-plan customers never reach here. (Bulk pay uses `runBulkQuickPay`.)
  async function payCustomerQuick(
    customer: Customer,
  ): Promise<MultiMonthConflict[]> {
    if (!customer.plan || customer.plan.price === null || !user) return [];
    const { year, month } = getCurrentYearMonth();
    const planCurrency = findCurrency(currencies, customer.plan.currencyId);
    if (customer.plan.durationMonths > 1) {
      if (!currentTier) return [];
      return await createMultiMonthPayment(
        toBillingMonth(year, month),
        customer,
        customer.plan,
        planCurrency,
        customer.plan.price,
        user.id,
        null,
        user.tenantId,
        false,
        year,
        graceDays,
        currentTier,
      );
    }
    await createPayment(
      {
        billingMonth: toBillingMonth(year, month),
        amountDue: customer.plan.price,
        amountPaid: customer.plan.price,
        durationMonths: 1,
        currencyId: customer.plan.currencyId,
        customerId: customer.id,
        planId: customer.plan.id,
        receivedByUserId: user.id,
        tenantId: user.tenantId,
        notes: null,
      },
      planCurrency,
      customer,
      graceDays,
    );
    return [];
  }

  async function recordSingleMonth(customer: Customer) {
    setQuickPayCustomerId(customer.id);
    try {
      await payCustomerQuick(customer);
    } finally {
      setQuickPayCustomerId(null);
    }
  }

  async function handleMultiMonthQuickPay(customer: Customer) {
    if (!customer.plan || customer.plan.price === null || !user || !currentTier)
      return;
    const { year, month } = getCurrentYearMonth();
    const startMonth = toBillingMonth(year, month);
    const planCurrency = findCurrency(currencies, customer.plan.currencyId);
    const ok = await confirm({
      title: t("payments.quick_pay.confirm_multi_month_title"),
      message: t("payments.quick_pay.confirm_multi_month_message", {
        amount: formatMoney(customer.plan.price, planCurrency, planCurrency),
        months: getBlockRangeLabel(startMonth, customer.plan.durationMonths, t),
      }),
      confirmLabel: t("payments.quick_pay.confirm"),
    });
    if (!ok) return;
    setQuickPayCustomerId(customer.id);
    try {
      await payCustomerQuick(customer);
    } finally {
      setQuickPayCustomerId(null);
    }
  }

  function handleQuickPay(customer: Customer) {
    if (!customer.plan || customer.plan.isCustomPrice) {
      router.push({
        pathname: "/(app)/(tabs)/customers/[id]",
        params: { id: customer.id, quickPay: "1" },
      });
      return;
    }
    if (customer.plan.durationMonths > 1) {
      void handleMultiMonthQuickPay(customer);
      return;
    }
    void recordSingleMonth(customer);
  }

  function shouldShowQuickPay(customer: Customer): boolean {
    if (!customer.active || !customer.isRegular) return false;
    if (hasCurrentMonthPayment(customer.id)) return false;
    const { year, month } = getCurrentYearMonth();
    if (isBeforeStartDate(year, month, customer.startDate)) return false;
    return true;
  }

  const openMenu = useCallback((customer: Customer) => {
    setMenuCustomer(customer);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => {
      // Any unpaid past month forces "unpaid" even when the current month is
      // settled; otherwise fall back to the current month's status.
      const paymentStatus: "paid" | "partial" | "unpaid" =
        overdueCustomerIds.has(item.id)
          ? "unpaid"
          : currentMonthFullyPaidIds.has(item.id)
            ? "paid"
            : currentMonthPartialIds.has(item.id)
              ? "partial"
              : "unpaid";
      return (
        <CustomerCard
          customer={item}
          paymentStatus={paymentStatus}
          monthLabel={monthLabel}
          onPress={openDetail}
          onMenu={openMenu}
          menuLoading={quickPayCustomerId === item.id}
          selectionMode={selectionActive}
          selected={selectedIds.has(item.id)}
          onToggleSelect={handleToggleSelect}
          onEnterSelection={handleEnterSelection}
        />
      );
    },
    [
      currentMonthFullyPaidIds,
      currentMonthPartialIds,
      overdueCustomerIds,
      monthLabel,
      openDetail,
      openMenu,
      quickPayCustomerId,
      selectionActive,
      selectedIds,
      handleToggleSelect,
      handleEnterSelection,
    ],
  );

  async function handleToggleActiveCustomer(customer: Customer) {
    const ok = await confirm({
      title: customer.active
        ? t("customers.deactivate_title")
        : t("customers.reactivate_title"),
      message: customer.active
        ? t("customers.deactivate_message", { name: customer.name })
        : t("customers.reactivate_message", { name: customer.name }),
      destructive: customer.active,
    });
    if (!ok) return;
    if (customer.active) {
      await deactivateCustomer(customer.id);
    } else {
      await reactivateCustomer(customer.id);
    }
  }

  async function handleVoidCurrentMonth(customer: Customer) {
    if (!user) return;
    const ok = await confirm({
      title: t("payments.void_confirm_title"),
      message: t("payments.void_confirm_message", {
        month: t(`months.${MONTHS[new Date().getMonth()]}`),
        year: new Date().getFullYear(),
      }),
      confirmLabel: t("payments.void_payment"),
      destructive: true,
    });
    if (!ok) return;
    const voided = await voidCurrentMonthForCustomer(customer.id, user.id);
    // The slice clears the current-month badge optimistically; recompute the
    // overdue badge since the freed month may now read as unpaid.
    if (voided) void fetchOverdueStatus(customers, graceDays);
  }

  async function handleDeleteCustomer(customer: Customer) {
    const ok = await confirm({
      title: t("customers.delete_title"),
      message: t("customers.delete_message", { name: customer.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteCustomer(customer.id);
  }

  // Bulk quick pay: pay every eligible fixed-price customer (single AND
  // multi-month) in ONE DB round-trip. Custom-price/no-plan are skipped;
  // multi-month are paid but flagged in the confirm. The batch is all-or-nothing
  // (single upsert) — on failure the slice records the reason and 0 are paid.
  async function runBulkQuickPay(selected: Customer[]) {
    if (bulkBusy || selected.length === 0 || !user) return;
    const payable: Customer[] = [];
    let multiCount = 0;
    let customCount = 0;
    for (const c of selected) {
      if (!shouldShowQuickPay(c)) continue; // inactive / non-regular / already paid / before start
      if (!c.plan || c.plan.isCustomPrice) {
        customCount++;
        continue;
      }
      payable.push(c);
      if (c.plan.durationMonths > 1) multiCount++;
    }

    if (payable.length === 0) {
      await confirm({
        title: t("payments.quick_pay.pay_now"),
        message: t("customers.bulk_pay_none"),
        confirmLabel: t("common.ok"),
        hideCancel: true,
      });
      return;
    }

    const warnings: string[] = [];
    if (multiCount > 0)
      warnings.push(t("customers.bulk_pay_warn_multi", { count: multiCount }));
    if (customCount > 0)
      warnings.push(
        t("customers.bulk_pay_skip_custom", { count: customCount }),
      );
    const ok = await confirm({
      title: t("payments.quick_pay.pay_now"),
      message:
        t("customers.bulk_pay_message", { count: payable.length }) +
        (warnings.length > 0 ? "\n\n" + warnings.join("\n") : ""),
      confirmLabel: t("payments.quick_pay.pay_now"),
    });
    if (!ok || !currentTier) return;

    setBulkBusy(true);
    let paidCount = 0;
    try {
      // Each customer pays its plan's full price for the current month, in its
      // own currency. The slice freezes the rate per request and syncs badges.
      paidCount = await bulkPayCustomers(
        payable.map((c) => ({
          customer: c,
          plan: c.plan!,
          currency: findCurrency(currencies, c.plan!.currencyId),
          amountPaid: c.plan!.price!,
        })),
        user.id,
        user.tenantId,
        currentTier,
      );
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
    fetchCurrentMonthPaymentStatus();
    const failedCount = payable.length - paidCount;
    if (failedCount > 0) {
      clearPaymentError();
      clearPaymentTierLimitError();
      setBulkNotice(
        t("customers.bulk_pay_summary", { ok: paidCount, failed: failedCount }),
      );
    }
  }

  async function runBulkDelete(selected: Customer[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      await handleDeleteCustomer(selected[0]);
      clearSelection();
      return;
    }
    const ok = await confirm({
      title: t("customers.bulk_delete_title", { count: selected.length }),
      message: t("customers.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await bulkDeleteCustomers(selected.map((c) => c.id));
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
  }

  // Toolbar actions for the selection header. 1 selected → edit / toggle / delete
  // / quick-pay (toggle + delete admin-only); >1 → delete / quick-pay only.
  function buildSelectionActions(selected: Customer[]): SelectionAction[] {
    if (selected.length === 0) return [];
    const actions: SelectionAction[] = [];
    if (selected.length === 1) {
      const one = selected[0];
      actions.push({
        key: "edit",
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
        icon: "trash-outline",
        label: t("common.delete"),
        destructive: true,
        disabled: bulkBusy,
        onPress: () => void runBulkDelete(selected),
      });
    }
    actions.push({
      key: "quick-pay",
      icon: "flash-outline",
      label: t("payments.quick_pay.pay_now"),
      disabled: bulkBusy,
      onPress: () => {
        if (selected.length === 1) {
          handleQuickPay(selected[0]);
          clearSelection();
        } else {
          void runBulkQuickPay(selected);
        }
      },
    });
    return actions;
  }

  function buildMenuActions(customer: Customer | null): ActionMenuItem[] {
    if (!customer) return [];
    const items: ActionMenuItem[] = [];
    if (shouldShowQuickPay(customer)) {
      items.push({
        key: "quick-pay",
        label: t("payments.quick_pay.pay_now"),
        icon: "flash-outline",
        onPress: () => handleQuickPay(customer),
      });
    }
    if (hasCurrentMonthPayment(customer.id)) {
      items.push({
        key: "void-current-month",
        label: t("payments.void_current_month"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => void handleVoidCurrentMonth(customer),
      });
    }
    items.push({
      key: "edit",
      label: t("common.edit"),
      icon: "create-outline",
      onPress: () => setEditingCustomer(customer),
    });
    if (isAdmin) {
      items.push({
        key: "toggle-active",
        label: customer.active
          ? t("customers.deactivate")
          : t("customers.activate"),
        icon: customer.active ? "pause-circle-outline" : "play-circle-outline",
        destructive: customer.active,
        onPress: () => void handleToggleActiveCustomer(customer),
      });
      items.push({
        key: "delete",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => void handleDeleteCustomer(customer),
      });
    }
    return items;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("customers.title")}
        subtitle={t("customers.active_count", { count: activeCount })}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedCustomers),
          onClose: clearSelection,
        }}
      />

      <ResponsiveContainer className="flex-1">
      {/* Search + filter tabs stay mounted while selecting so their space
          remains and the list never jumps; the select-all bar overlays them. */}
      <SelectionOverlaySlot
        selecting={selectionActive}
        overlay={
          <SelectAllBar
            allSelected={
              filtered.length > 0 &&
              selectedCustomers.length === filtered.length
            }
            onToggle={() => toggleManySelect(filtered.map((c) => c.id))}
          />
        }
      >
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
              <PressableOpacity
                key={tab.key}
                onPress={() => {
                  setActiveTab(tab.key);
                  clearSelection();
                }}
                className={`rounded-full px-3 py-1.5 ${activeTab === tab.key ? "bg-gray-900" : "bg-gray-100"}`}
              >
                <Text
                  className={`text-xs font-semibold ${activeTab === tab.key ? "text-white" : "text-gray-600"}`}
                >
                  {tab.label}
                </Text>
              </PressableOpacity>
            ))}
          </View>
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
                fetchCurrentMonthPaymentStatus();
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
                !debouncedSearch && customers.length === 0
                  ? t("customers.create_first_customer")
                  : undefined
              }
              onAction={
                !debouncedSearch && customers.length === 0
                  ? () => setFormVisible(true)
                  : undefined
              }
            />
          }
        />
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
    </SafeAreaView>
  );
}
