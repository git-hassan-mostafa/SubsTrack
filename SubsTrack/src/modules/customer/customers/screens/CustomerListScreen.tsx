import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { PillTabs } from "@/src/shared/components/PillTabs";
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
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import type { Customer, Payment } from "@/src/core/types";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { CustomerCard } from "../components/CustomerCard";
import {
  customerFlags,
  hasDebtFlag,
  type CustomerFlag,
} from "../utils/customerFlags";
import { CustomerHistorySheet } from "../components/CustomerHistorySheet";
import { CustomerFormSheet } from "../components/CustomerFormSheet";
import { CustomDebtFormSheet } from "@/src/modules/transaction/debts/components/CustomDebtFormSheet";
import { DebtPaymentFormSheet } from "@/src/modules/transaction/debts/components/DebtPaymentFormSheet";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useAuth } from "../../../authentication/auth/hooks/useAuth";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { getCurrentYearMonth } from "@/src/core/utils/date";
import { isBeforeStartDate } from "@/src/modules/customer/customer-payments/utils/monthDueRules";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { FilterToggleButton } from "@/src/shared/components/FilterToggleButton";
import { MONTHS } from "@/src/core/constants";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { BulkPayCustomerRequest } from "@/src/state/slices/payments/paymentSlice";
import { SaleFormSheet } from "@/src/modules/transaction/sales";

// The payment tabs are exactly the card's payment flags (`CustomerFlag`), so a
// customer is in a tab if and only if their card shows that pill. "skipped" has
// no tab — nothing is owed, so there is nothing to work through.
// "has_debt" is the one payment-ish tab that is NOT a month flag: it reads the
// debt ledger, exactly like the card's debt pill.
type StatusTab = Exclude<CustomerFlag, "skipped">;
type FilterTab = "all" | "active" | "inactive" | "has_debt" | StatusTab;

const STATUS_TABS: StatusTab[] = [
  "unpaid",
  "overdue",
  "mixed",
  "paid",
  "not_due_yet",
];

const STATUS_TAB_LABELS: Record<StatusTab, string> = {
  unpaid: "dashboard.unpaid",
  overdue: "customers.overdue",
  mixed: "customers.partly_paid",
  paid: "common.paid",
  not_due_yet: "payments.not_due_yet_label",
};

export function CustomerListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
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
  const customerStatuses = usePaymentSlice((s) => s.customerStatuses);
  const fetchCustomerStatuses = usePaymentSlice((s) => s.fetchCustomerStatuses);
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
  const netDebtByCustomer = useDebtSlice((s) => s.netByCustomer);
  const fetchNetDebtByCustomer = useDebtSlice((s) => s.fetchNetByCustomer);
  const addDebtPayment = useDebtSlice((s) => s.addDebtPayment);
  const { canSend, sendPaymentInvoice } = useSendInvoice();
  const displayCurrencyId = useDisplayCurrencyId();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);
  const [formVisible, setFormVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickPayCustomerId, setQuickPayCustomerId] = useState<string | null>(
    null,
  );
  const [menuCustomer, setMenuCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  // Quick-action sheets launched from the card menu, each scoped to one customer.
  const [customDebtCustomer, setCustomDebtCustomer] = useState<Customer | null>(
    null,
  );
  const [debtPaymentCustomer, setDebtPaymentCustomer] =
    useState<Customer | null>(null);
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
  const branchFilter = useEffectiveBranchFilter();

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch]);

  // Loads on mount AND re-fetches when the user switches the branch chip.
  useEffect(() => {
    clearSelection();
    fetchCustomers();
    void fetchNetDebtByCustomer();
  }, [branchFilter, clearSelection, fetchCustomers, fetchNetDebtByCustomer]);

  // Rebuilds every badge on focus and whenever the loaded customer set changes
  // (reload, pagination). ONE call covers this month AND older unpaid months, so
  // the two facts always land together — the badge is never assembled from a
  // half-loaded picture. Refreshing on focus keeps it correct after a month is
  // paid from the detail panel.
  useFocusEffect(
    useCallback(() => {
      void fetchCustomerStatuses(customers);
      // Refresh debt flags on return — debts change from the Debts tab, quick
      // pay, and partial payments made in the detail panel.
      void fetchNetDebtByCustomer();
    }, [customers, fetchCustomerStatuses, fetchNetDebtByCustomer]),
  );

  const tabs = useMemo(() => {
    return [
      { key: "active" as FilterTab, label: t("common.active") },
      ...STATUS_TABS.map((key) => ({
        key: key as FilterTab,
        label: t(STATUS_TAB_LABELS[key]),
      })),
      { key: "has_debt" as FilterTab, label: t("customers.has_debts") },
      { key: "all" as FilterTab, label: t("customers.all") },
      { key: "inactive" as FilterTab, label: t("common.inactive") },
    ];
  }, [t]);

  // "Already has a payment recorded for this month" — some or all plans. Gates
  // the menu's void-this-month row (there has to be something to void).
  const hasCurrentMonthPayment = useCallback(
    (id: string) => {
      const s = customerStatuses.get(id)?.status;
      return s === "paid" || s === "mixed";
    },
    [customerStatuses],
  );

  const filtered = useMemo(() => {
    if (activeTab === "all") return customers;
    if (activeTab === "active") return customers.filter((c) => c.active);
    if (activeTab === "inactive") return customers.filter((c) => !c.active);
    // Debt isn't a month status, so it reads the ledger the card's debt pill
    // reads — and like that pill it ignores active / regular: a deactivated or
    // occasional customer who still owes money is exactly who this tab is for.
    if (activeTab === "has_debt")
      return customers.filter((c) => hasDebtFlag(netDebtByCustomer[c.id]));
    // Payment tabs are the card's flags: same helper, so a customer shows up in
    // every tab whose pill they wear, and in none they don't.
    return customers.filter((c) => {
      if (!c.active || !c.isRegular) return false;
      const status = customerStatuses.get(c.id);
      if (!status) return false; // not computed yet — don't guess either way
      return customerFlags(status).includes(activeTab);
    });
  }, [activeTab, customers, customerStatuses, netDebtByCustomer]);

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

  // Active service lines that have started by this month — the lines that are
  // "in play" for the current month (paid or not). Drives single- vs multi-plan
  // menu wording and quick-pay gating.
  function startedActiveLines(customer: Customer) {
    const { year, month } = getCurrentYearMonth();
    return (customer.customerPlans ?? []).filter(
      (l) => l.active && !isBeforeStartDate(year, month, l.startDate),
    );
  }

  // Active, started, fixed-price service lines eligible for one-tap current-month
  // pay. Custom-price / plan-less lines need the manual form and are excluded.
  // Lines not due this month (already covered by a payment, or skipped) are left
  // out so a mixed multi-plan customer pays only the plans still owed.
  function eligibleFixedLines(customer: Customer): BulkPayCustomerRequest[] {
    const status = customerStatuses.get(customer.id);
    const notDue = new Set(status?.notDueLineIds);
    // Months are settled oldest-first, so a line with an older uncovered month
    // can't have THIS month collected — its backlog is paid from the customer's
    // month grid instead.
    const uncovered = new Set(status?.uncoveredLineIds);
    return startedActiveLines(customer)
      .filter(
        (l) =>
          l.plan != null &&
          !l.plan.isCustomPrice &&
          l.plan.price !== null &&
          !notDue.has(l.id) &&
          !uncovered.has(l.id),
      )
      .map((l) => ({
        customerId: customer.id,
        line: l,
        plan: l.plan!,
        currency: findCurrency(currencies, l.plan!.currencyId),
        amountPaid: l.plan!.price!,
      }));
  }

  // True when the customer has any started active line still unpaid this month —
  // so there is something a quick pay could collect (a fixed line to one-tap pay
  // or a custom/plan-less line that opens the manual form).
  function hasUnpaidStartedLine(customer: Customer): boolean {
    const status = customerStatuses.get(customer.id);
    const notDue = new Set(status?.notDueLineIds);
    const uncovered = new Set(status?.uncoveredLineIds);
    return startedActiveLines(customer).some(
      (l) => !notDue.has(l.id) && !uncovered.has(l.id),
    );
  }

  // Pays the current month for every eligible fixed-price line of the given
  // requests in one batch ("collect all due"), then refreshes the badges.
  // Returns the created payments so a caller can invoice them.
  async function executePay(
    requests: BulkPayCustomerRequest[],
  ): Promise<Payment[]> {
    if (!user || !currentTier || requests.length === 0) return [];
    const created = await bulkPayCustomers(
      requests,
      user.id,
      user.tenantId,
      currentTier,
    );
    clearSelection();
    void fetchCustomerStatuses(customers);
    const failed = requests.length - created.length;
    if (failed > 0) {
      clearPaymentError();
      clearPaymentTierLimitError();
      setBulkNotice(
        t("customers.bulk_pay_summary", { ok: created.length, failed }),
      );
    }
    return created;
  }

  // Single-customer quick pay from the card / menu. Pays all eligible fixed-price
  // lines; custom-price / plan-less customers open the detail form instead.
  // `send` also WhatsApps one invoice covering every line just paid.
  async function handleQuickPay(customer: Customer, send = false) {
    const requests = eligibleFixedLines(customer);
    if (requests.length === 0) {
      router.push({
        pathname: "/(app)/(tabs)/customers/[id]",
        params: { id: customer.id, quickPay: "1" },
      });
      return;
    }
    const multiCount = requests.filter((r) => r.plan.durationMonths > 1).length;
    // Confirm when paying several lines or a multi-month block; a single
    // single-month line pays instantly (matches the old snappy quick pay).
    if (requests.length > 1 || multiCount > 0) {
      const ok = await confirm({
        title: t("payments.quick_pay.pay_now"),
        message:
          t("customers.bulk_pay_lines_message", { count: requests.length }) +
          (multiCount > 0
            ? "\n\n" + t("customers.bulk_pay_warn_multi", { count: multiCount })
            : ""),
        confirmLabel: t("payments.quick_pay.pay_now"),
      });
      if (!ok) return;
    }
    setQuickPayCustomerId(customer.id);
    try {
      const created = await executePay(requests);
      // ONE message for the whole batch — a multi-plan customer gets a single
      // chat listing every line, not one message per plan.
      if (send && created.length > 0) {
        await sendPaymentInvoice({
          phone: customer.phoneNumber,
          customerName: customer.name,
          rows: created.map((p) => ({
            payment: p,
            planName:
              requests.find((r) => r.line.id === p.customerPlanId)?.plan.name ??
              null,
          })),
        });
      }
    } finally {
      setQuickPayCustomerId(null);
    }
  }

  // Show quick pay whenever a started line is still unpaid this month — for a
  // single-plan customer this means "no payment yet"; for a multi-plan customer
  // it also covers the mixed case (some plans paid, some not) so the remaining
  // unpaid plans can be collected.
  function shouldShowQuickPay(customer: Customer): boolean {
    if (!customer.active || !customer.isRegular) return false;
    return hasUnpaidStartedLine(customer);
  }

  const openMenu = useCallback((customer: Customer) => {
    setMenuCustomer(customer);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => {
      // The card decides its own flags from the status — no priority chain here.
      // `undefined` (not yet computed) is passed through as null so the card
      // renders no payment flag instead of guessing "unpaid".
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
          menuLoading={quickPayCustomerId === item.id}
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
    // Multi-plan customers void every plan paid this month at once, so the
    // confirm spells that out; single-plan keeps the plain wording.
    const isMulti = startedActiveLines(customer).length >= 2;
    const ok = await confirm({
      title: isMulti
        ? t("payments.void_paid_plans_confirm_title")
        : t("payments.void_confirm_title"),
      message: t(
        isMulti
          ? "payments.void_paid_plans_confirm_message"
          : "payments.void_confirm_message",
        {
          month: t(`months.${MONTHS[new Date().getMonth()]}`),
          year: new Date().getFullYear(),
        },
      ),
      confirmLabel: t("payments.void_payment"),
      destructive: true,
    });
    if (!ok) return;
    const voided = await voidCurrentMonthForCustomer(customer.id, user.id);
    // The freed month may now read as unpaid (or overdue), and the voided lines
    // must drop out of the covered set so quick pay can collect them again.
    if (voided) void fetchCustomerStatuses(customers);
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

  // Bulk quick pay ("collect all due"): pay every eligible fixed-price line of
  // every selected customer (single AND multi-month) in ONE DB round-trip.
  // Custom-price / plan-less and already-covered customers are skipped; multi-
  // month lines are flagged in the confirm. All-or-nothing (single upsert) — on
  // failure the slice records the reason and 0 are paid.
  async function runBulkQuickPay(selected: Customer[]) {
    if (bulkBusy || selected.length === 0 || !user) return;
    const eligible = selected.filter(shouldShowQuickPay);
    const requests = eligible.flatMap(eligibleFixedLines);
    const customerCount = new Set(requests.map((r) => r.customerId)).size;
    const customCount = eligible.length - customerCount;
    const multiCount = requests.filter((r) => r.plan.durationMonths > 1).length;

    if (requests.length === 0) {
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
        t("customers.bulk_pay_lines_message", { count: requests.length }) +
        (warnings.length > 0 ? "\n\n" + warnings.join("\n") : ""),
      confirmLabel: t("payments.quick_pay.pay_now"),
    });
    if (!ok || !currentTier) return;

    setBulkBusy(true);
    try {
      await executePay(requests);
    } finally {
      setBulkBusy(false);
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

  // Pay off a customer's WHOLE net debt in one shot: a single debt payment
  // equal to their net (recorded in USD, the canonical net — clears it exactly;
  // the service caps at the net owed either way). Shown only when they owe.
  async function handlePayFullDebt(customer: Customer) {
    if (!user) return;
    const netUsd = netDebtByCustomer[customer.id] ?? 0;
    if (netUsd <= 0) return;
    const ok = await confirm({
      title: t("debts.pay_full_title"),
      message: t("debts.pay_full_message", {
        amount: formatMoney(netUsd, null, displayCurrency),
        customer: customer.name,
      }),
      confirmLabel: t("debts.pay"),
    });
    if (!ok) return;
    await addDebtPayment({
      customerId: customer.id,
      amount: netUsd,
      notes: null,
      currency: null,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
    });
  }

  function buildMenuActions(customer: Customer | null): ActionMenuItem[] {
    if (!customer) return [];
    const items: ActionMenuItem[] = [];
    const hasDebt = hasDebtFlag(netDebtByCustomer[customer.id]);
    // A customer with 2+ plans in play this month gets the plan-aware wording
    // ("Quick pay unpaid plans" / "Void paid plans"); a single-plan customer
    // keeps the plain "Quick pay" / "Void current month" labels.
    const isMulti = startedActiveLines(customer).length >= 2;
    if (shouldShowQuickPay(customer)) {
      items.push({
        key: "quick-pay",
        label: isMulti
          ? t("payments.quick_pay.pay_unpaid_plans")
          : t("payments.quick_pay.menu_label"),
        icon: "flash-outline",
        onPress: () => handleQuickPay(customer),
      });
      // Only when there is really something to one-tap pay: with no eligible
      // fixed line, quick pay routes to the detail screen instead of paying, and
      // that screen's form already carries its own "Save & send".
      if (eligibleFixedLines(customer).length > 0) {
        const sendable = canSend(customer.phoneNumber);
        items.push({
          key: "quick-pay-whatsapp",
          label: t("invoice.pay_and_send_whatsapp"),
          icon: "logo-whatsapp",
          renderIcon: (size: number) => (
            <WhatsAppComboIcon variant="pay" size={size} />
          ),
          disabled: !sendable,
          caption: sendable ? undefined : t("invoice.no_phone"),
          onPress: () => void handleQuickPay(customer, true),
        });
      }
    }
    if (hasCurrentMonthPayment(customer.id)) {
      items.push({
        key: "void-current-month",
        label: isMulti
          ? t("payments.void_paid_plans")
          : t("payments.void_current_month"),
        icon: "close-circle-outline",
        destructive: true,
        onPress: () => void handleVoidCurrentMonth(customer),
      });
    }
    items.push({
      key: "record-sale",
      label: t("sales.record_button"),
      icon: "receipt-outline",
      iconBadge: "add",
      onPress: () => setSaleCustomer(customer),
    });
    items.push({
      key: "add-custom-debt",
      label: t("debts.add_custom_debt"),
      icon: "document-text-outline",
      iconBadge: "add",
      onPress: () => setCustomDebtCustomer(customer),
    });
    items.push({
      key: "record-debt-payment",
      label: t("debts.record_debt_payment"),
      icon: "cash-outline",
      iconBadge: "add",
      onPress: () => setDebtPaymentCustomer(customer),
    });
    if (hasDebt) {
      items.push({
        key: "pay-full-debt",
        label: t("debts.pay_full"),
        icon: "checkmark-done-outline",
        onPress: () => void handlePayFullDebt(customer),
      });
    }
    items.push({
      key: "edit",
      label: t("common.edit"),
      icon: "create-outline",
      onPress: () => setEditingCustomer(customer),
    });
    items.push({
      key: "history",
      label: t("audit.customer_history_action"),
      icon: "time-outline",
      onPress: () => setHistoryCustomer(customer),
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

  // Memoized so opening a sheet (form / sale / debt / menu — all plain state on
  // this screen) doesn't rebuild the list. Without this, every "Add customer" tap
  // re-rendered the whole FlatList before the sheet could even start animating.
  // React Compiler would do this for free, but it can't optimize this file — the
  // bulk-pay handlers use `try/finally`, which the current version rejects.
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
    ),
    [
      filtered,
      loading,
      loadingMore,
      renderItem,
      t,
      debouncedSearch,
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
        {/* Search + filter tabs stay mounted while selecting so their space
          remains and the list never jumps; the selection toolbar (with the
          select-all checkbox) is overlaid on the header instead. */}
        <SelectionOverlaySlot selecting={selectionActive}>
          <View className="px-4 pt-4">
            {/* Search */}
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
                hasActiveFilters={activeTab !== "all"}
                onPress={() => setFiltersOpen((v) => !v)}
              />
            </View>
            {/* Filter tabs */}
            {filtersOpen ? (
              <PillTabs<FilterTab>
                value={activeTab}
                tabs={tabs}
                className="mt-4"
                onChange={(key) => {
                  setActiveTab(key);
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
      {debtPaymentCustomer && (
        <DebtPaymentFormSheet
          initialCustomer={debtPaymentCustomer}
          onDismiss={() => setDebtPaymentCustomer(null)}
        />
      )}
    </SafeAreaView>
  );
}
