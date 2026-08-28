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
import type { Collection, Customer, CustomerPlan, OpenItem } from "@/src/core/types";
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
import {
  useCollectSheet,
  virtualMonthItem,
} from "@/src/modules/ledger";
import { useCustomerSlice } from "@/src/state/hooks/useCustomerSlice";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useAuth } from "../../../authentication/auth/hooks/useAuth";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { isBeforeStartDate } from "@/src/modules/customer/customer-payments/utils/monthDueRules";
import { resolveLinePrice } from "@/src/modules/customer/customer-plans/utils/linePrice";
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
  const paymentError = usePaymentSlice((s) => s.error);
  const clearPaymentError = usePaymentSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const netDebtByCustomer = useLedgerSlice((s) => s.netByCustomer);
  const fetchNetDebtByCustomer = useLedgerSlice((s) => s.fetchNetByCustomer);
  const collect = useLedgerSlice((s) => s.collect);
  const fetchOwed = useLedgerSlice((s) => s.fetchOwed);
  const owed = useLedgerSlice((s) => s.owed);
  const { canSend, sendCollectionInvoice } = useSendInvoice();
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
  // Whose pool the collect sheet is loading. It opens once `owed` lands.
  const [collectCustomer, setCollectCustomer] = useState<Customer | null>(null);
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
  function eligibleFixedLines(customer: Customer): OpenItem[] {
    const status = customerStatuses.get(customer.id);
    const notDue = new Set(status?.notDueLineIds);
    // Months are settled oldest-first, so a line with an older uncovered month
    // can't have THIS month collected — its backlog is paid from the customer's
    // month grid instead.
    const uncovered = new Set(status?.uncoveredLineIds);
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    return startedActiveLines(customer)
      .filter(
        (l) =>
          resolveLinePrice(l).isFixed && !notDue.has(l.id) && !uncovered.has(l.id),
      )
      .map((l) => {
        // One resolution per line, feeding BOTH the amount and the rate snapshot
        // — separating them is how an LBP amount ends up frozen at a USD rate.
        const price = resolveLinePrice(l);
        // A line reaching here has had NO money this month (that is exactly what
        // `notDueLineIds` excludes), so the month has no bill yet and the item is
        // virtual — its charge is raised by the collect that pays it.
        return virtualMonthItem({
          customerId: customer.id,
          customerName: customer.name,
          branchId: customer.branchId,
          customerPlanId: l.id,
          billingMonth,
          durationMonths: price.durationMonths,
          planId: l.planId,
          label: planLabel(l, billingMonth),
          amount: price.amount!,
          currencyId: price.currencyId,
          ratePerUsdSnapshot:
            findCurrency(currencies, price.currencyId)?.ratePerUsd ?? 1,
          dueDate: billingMonth,
        });
      });
  }

  /** "Jan 2026 · Internet" — what the receipt and the split preview show. */
  function planLabel(line: CustomerPlan, billingMonth: string): string {
    const [y, m] = billingMonth.split("-").map(Number);
    const base = `${t(`months.${MONTHS[m - 1]}`)} ${y}`;
    return line.plan?.name ? `${base} · ${line.plan.name}` : base;
  }

  // Lines due this month that quick pay can't collect because no amount is
  // remembered (custom-price / plan-less with no special price) — they need the
  // manual form. Counted per LINE, not per customer: a customer with one
  // collectable and one typed line is partly skipped, and saying "0 skipped"
  // there is what made the old customer-based count misleading.
  function typedLinesDueCount(customer: Customer): number {
    const status = customerStatuses.get(customer.id);
    const notDue = new Set(status?.notDueLineIds);
    const uncovered = new Set(status?.uncoveredLineIds);
    return startedActiveLines(customer).filter(
      (l) =>
        !resolveLinePrice(l).isFixed && !notDue.has(l.id) && !uncovered.has(l.id),
    ).length;
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

  /**
   * Collects the current month for the given items ("collect all due").
   *
   * ONE hand-over per customer PER CURRENCY: a collection is single-currency by
   * design (that is what lets a balance close at exactly zero), so a customer
   * with an LBP line and a USD line is two rows — physically two piles of cash.
   * Returns them so a caller can send the receipts.
   */
  async function executePay(items: OpenItem[]): Promise<Collection[]> {
    if (!user || items.length === 0) return [];
    const groups = new Map<string, OpenItem[]>();
    for (const item of items) {
      const key = `${item.customerId}|${item.currencyId ?? "USD"}`;
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }

    const created: Collection[] = [];
    let failed = 0;
    for (const group of groups.values()) {
      const amount = group.reduce((sum, i) => sum + i.balance, 0);
      const row = await collect({
        tenantId: user.tenantId,
        customerId: group[0].customerId,
        branchId: group[0].branchId,
        amount,
        currencyId: group[0].currencyId,
        ratePerUsdSnapshot: group[0].ratePerUsdSnapshot,
        receivedAt: new Date().toISOString(),
        receivedByUserId: user.id,
        notes: null,
        lines: group.map((item) => ({ item, amount: item.balance, settles: true })),
      });
      if (row) created.push(row);
      else failed += 1;
    }

    clearSelection();
    void fetchCustomerStatuses(customers);
    void fetchNetDebtByCustomer(branchFilter);
    if (failed > 0) {
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
    const multiCount = requests.filter((r) => r.durationMonths > 1).length;
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
      // ONE message per hand-over — a multi-plan customer in one currency gets a
      // single chat listing every line, which is what the receipt already is.
      if (send) {
        for (const collection of created) {
          await sendCollectionInvoice({
            phone: customer.phoneNumber,
            customerName: customer.name,
            collection,
          });
        }
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

  const collectSheet = useCollectSheet({
    onCollected: () => {
      setCollectCustomer(null);
      void fetchCustomerStatuses(customers);
      void fetchNetDebtByCustomer(branchFilter);
    },
  });

  // The pool is a round trip; open the sheet the moment it lands. Cleared
  // straight away so re-picking the same customer opens it again.
  useEffect(() => {
    if (!collectCustomer || owed.length === 0) return;
    collectSheet.open(collectCustomer.id, collectCustomer.name, owed);
    setCollectCustomer(null);
  }, [collectCustomer, owed, collectSheet]);

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
    const customCount = eligible.reduce(
      (n, c) => n + typedLinesDueCount(c),
      0,
    );
    const multiCount = requests.filter((r) => r.durationMonths > 1).length;

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

  // Collect against everything a customer owes — the waterfall settles it
  // oldest-first and the sheet shows the split before anything is written.
  // Loading their pool is a round trip, so the sheet opens once it lands.
  async function handleCollectDebt(customer: Customer) {
    setCollectCustomer(customer);
    await fetchOwed(customer, customer.customerPlans ?? [], currencies);
  }

  function buildMenuActions(customer: Customer | null): ActionMenuItem[] {
    if (!customer) return [];
    const items: ActionMenuItem[] = [];
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
      key: "collect",
      label: t("ledger.collect_money"),
      icon: "cash-outline",
      iconBadge: "add",
      onPress: () => void handleCollectDebt(customer),
    });
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
      {collectSheet.sheet}
    </SafeAreaView>
  );
}
