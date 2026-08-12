import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useHorizontalSwipe } from "@/src/shared/hooks/useHorizontalSwipe";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { confirm } from "@/src/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { InlineSelectionToolbar } from "@/src/shared/components/InlineSelectionToolbar";
import type {
  Customer,
  CustomerPlan,
  MonthEntry,
  Payment,
} from "@/src/core/types";
import { getCurrentYearMonth, getDateLocale } from "@/src/core/utils/date";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
  toUsd,
} from "@/src/core/utils/currency";
import { COLORS } from "@/src/shared/constants";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { MonthGrid } from "./MonthGrid";
import { PaymentDetailSheet } from "./PaymentDetailSheet";
import { PaymentFormSheet } from "./PaymentFormSheet";
import { SkipMonthSheet } from "./SkipMonthSheet";
import { VoidSheet } from "./VoidSheet";
import {
  BulkPaymentFormSheet,
  type BulkPaymentValues,
} from "./BulkPaymentFormSheet";
import { BulkVoidSheet } from "./BulkVoidSheet";
import {
  expandSelectionUnit,
  groupPayableBlocks,
} from "../utils/monthSelection";
import {
  billingMonthLabel,
  blockingPaidMonths,
  blockingUnpaidMonths,
  coveredBillingMonths,
} from "../utils/payOrder";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { SelectionAction } from "@/src/shared/components/PageHeader";
import { UpgradePromptModal } from "@/src/modules/admin/subscription";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { getStore } from "@/src/state/globalStore";

interface CustomerPaymentPanelProps {
  customer: Customer;
}

const EMPTY_GRID: MonthEntry[] = [];
const EMPTY_MONTHS: string[] = [];

// Label for a service line tab/header: its plan name, else a "no plan" tag.
function lineLabel(line: CustomerPlan, noPlan: string): string {
  return line.plan?.name || noPlan;
}

// A single at-a-glance payment status for a line's tab, derived from the viewed
// year's grid (reuses buildMonthGrid's statuses — no status logic here). Worst
// state wins so an overdue plan is flagged first: unpaid > paid (a partial
// payment reports as paid). Null means nothing is due yet this year (all future
// / before start) → no dot.
type LineIndicator = "paid" | "unpaid";

const INDICATOR_DOT: Record<LineIndicator, string> = {
  paid: "bg-green-500",
  unpaid: "bg-red-500",
};

function lineIndicatorStatus(grid: MonthEntry[]): LineIndicator | null {
  let hasPaid = false;
  for (const m of grid) {
    if (m.status === "unpaid") return "unpaid";
    if (m.status === "paid") hasPaid = true;
  }
  if (hasPaid) return "paid";
  return null;
}

export function CustomerPaymentPanel({ customer }: CustomerPaymentPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const router = useRouter();
  const { quickPay } = useLocalSearchParams<{ quickPay?: string }>();
  const { user } = useAuth();
  // Per-field selectors, never `usePaymentSlice()` bare: subscribing to the whole
  // slice re-renders this panel (month grid included) on every unrelated payment
  // change, and hands every effect a dep that changes identity each time.
  const payments = usePaymentSlice((s) => s.items);
  const monthGridsByLine = usePaymentSlice((s) => s.monthGridsByLine);
  const uncoveredMonthsByLine = usePaymentSlice((s) => s.uncoveredMonthsByLine);
  const paidMonthsByLine = usePaymentSlice((s) => s.paidMonthsByLine);
  const paymentsLoading = usePaymentSlice((s) => s.loading);
  const loadingUpdate = usePaymentSlice((s) => s.loadingUpdate);
  const paymentsError = usePaymentSlice((s) => s.error);
  const paymentsTierLimitError = usePaymentSlice((s) => s.tierLimitError);
  const getPayments = usePaymentSlice((s) => s.getPayments);
  const createPayment = usePaymentSlice((s) => s.createPayment);
  const createPayments = usePaymentSlice((s) => s.createPayments);
  const createMultiMonthPayment = usePaymentSlice(
    (s) => s.createMultiMonthPayment,
  );
  const createMultiMonthPayments = usePaymentSlice(
    (s) => s.createMultiMonthPayments,
  );
  const updatePayment = usePaymentSlice((s) => s.updatePayment);
  const clearPaymentError = usePaymentSlice((s) => s.clearError);
  const clearPaymentTierLimitError = usePaymentSlice(
    (s) => s.clearTierLimitError,
  );
  const resetPayments = usePaymentSlice((s) => s.reset);
  const currencies = useCurrencySlice((s) => s.items);
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const { canSend, sendPaymentInvoice } = useSendInvoice();
  const displayCurrencyId = useDisplayCurrencyId();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);

  // All of the customer's service lines (active + cancelled). Grids are built
  // for every line so a cancelled line's history stays viewable.
  const lines = useMemo(
    () => customer.customerPlans ?? [],
    [customer.customerPlans],
  );
  const linesKey = lines
    .map((l) => `${l.id}:${l.active}:${l.startDate}:${l.planId}`)
    .join(",");

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MonthEntry | null>(null);
  const [menuEntry, setMenuEntry] = useState<MonthEntry | null>(null);
  const [quickPayMonth, setQuickPayMonth] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [voidVisible, setVoidVisible] = useState(false);
  const quickPayHandledRef = useRef(false);

  const selection = useSelection();
  useSelectionBackHandler(selection.active, selection.clear);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPayVisible, setBulkPayVisible] = useState(false);
  // Whether the custom-amount bulk sheet should also send the invoice — the
  // choice is made in the toolbar, the amount only afterwards.
  const [bulkPaySend, setBulkPaySend] = useState(false);
  const [bulkVoidIds, setBulkVoidIds] = useState<string[] | null>(null);
  // Months being skipped / unskipped (one cell, or a whole selection).
  const [skipRequest, setSkipRequest] = useState<{
    entries: MonthEntry[];
    mode: "skip" | "unskip";
  } | null>(null);

  // Keep a valid line selected as lines load / change (prefer active lines).
  useEffect(() => {
    if (lines.length === 0) {
      setSelectedLineId(null);
      return;
    }
    if (!selectedLineId || !lines.some((l) => l.id === selectedLineId)) {
      const firstActive = lines.find((l) => l.active) ?? lines[0];
      setSelectedLineId(firstActive.id);
    }
    // `linesKey` stays the content-based trigger; the rest are listed because the
    // body is idempotent (a still-valid selection writes nothing).
  }, [linesKey, lines, selectedLineId]);

  const selectedLine = lines.find((l) => l.id === selectedLineId) ?? null;
  const plan = selectedLine?.plan ?? null;
  const grid = selectedLine
    ? (monthGridsByLine[selectedLine.id] ?? EMPTY_GRID)
    : EMPTY_GRID;
  // Every month this line has NOT covered, across ALL years — a backlog from a
  // previous year blocks paying a later one even though the viewed grid can't
  // show it, and a not-yet-due gap blocks a prepay jumping over it. Declared here
  // because the quick-pay effect below depends on it.
  const lineUncoveredMonths = selectedLine
    ? (uncoveredMonthsByLine[selectedLine.id] ?? EMPTY_MONTHS)
    : EMPTY_MONTHS;
  // The same, for the months this line HAS paid — voids run newest-first, and a
  // later paid month can also sit outside the viewed year.
  const linePaidMonths = selectedLine
    ? (paidMonthsByLine[selectedLine.id] ?? EMPTY_MONTHS)
    : EMPTY_MONTHS;

  // Price shown next to the plan name above the grid. A custom-price or
  // plan-less line has no fixed amount, so it reads "Custom" instead. Multi-month
  // plans say so, since the price covers the whole block, not one month.
  const linePriceLabel = (() => {
    if (!plan) return null;
    if (plan.isCustomPrice || plan.price === null) return t("common.custom");
    const amount = formatMoney(
      plan.price,
      findCurrency(currencies, plan.currencyId),
      displayCurrency,
    );
    // `subscription.per_month` is already slash-prefixed ("/ month") in both locales.
    return plan.durationMonths > 1
      ? `${amount} / ${t("plans.n_months", { count: plan.durationMonths })}`
      : `${amount} ${t("subscription.per_month")}`;
  })();

  // Loads every line's payments once per customer; switching years/lines
  // rebuilds the grids from the store instead of re-fetching.
  useEffect(() => {
    if (lines.length > 0) {
      getPayments(customer.id, lines, year);
    }
  }, [customer.id, year, linesKey, lines, getPayments]);

  // `selection.clear` (not `selection`) — the hook returns a fresh object each
  // render, so depending on it would loop.
  const clearGridSelection = selection.clear;
  useEffect(() => {
    clearGridSelection();
  }, [year, selectedLineId, clearGridSelection]);

  useEffect(() => {
    return () => resetPayments();
  }, [resetPayments]);

  // ?quickPay=1 handshake from the customer list: open the form for the current
  // month of the (first) selected line once its grid is ready. Fires at most once.
  useEffect(() => {
    if (quickPay !== "1" || quickPayHandledRef.current) return;
    if (paymentsLoading || grid.length === 0) return;
    const { year: cy, month: cm } = getCurrentYearMonth();
    const currentEntry = grid.find((m) => m.year === cy && m.month === cm);
    if (!currentEntry) return;
    quickPayHandledRef.current = true;
    router.setParams({ quickPay: undefined });
    // A skipped month can't be paid — explain instead of opening the form. Unless
    // a later paid month locked its unskip: collecting it is then the only way to
    // settle it, so the form opens as usual.
    if (
      currentEntry.status === "skipped" &&
      blockingPaidMonths(linePaidMonths, [currentEntry.billingMonth]).length ===
        0
    ) {
      void confirm({
        title: t("common.not_available"),
        message: t("payments.skip.pay_blocked"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }
    // Same oldest-first rule as a manual tap — the list can hand us a customer
    // whose current month is unpaid but whose backlog is older still.
    const blocker = blockingUnpaidMonths(lineUncoveredMonths, [
      currentEntry.billingMonth,
    ])[0];
    if (blocker) {
      void confirm({
        title: t("common.not_available"),
        message: t("payments.earlier_month_unpaid", {
          month: billingMonthLabel(blocker),
        }),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }
    setSelectedEntry(currentEntry);
    setFormVisible(true);
  }, [
    quickPay,
    paymentsLoading,
    grid,
    lineUncoveredMonths,
    linePaidMonths,
    router,
    t,
  ]);

  const lineActive = selectedLine?.active ?? false;

  // Calendar-future month (strictly after the current month) — the same thing
  // the "future" grid STATUS means for an unpaid month.
  function isCalendarFuture(entry: MonthEntry): boolean {
    const { year: cy, month: cm } = getCurrentYearMonth();
    return entry.year > cy || (entry.year === cy && entry.month > cm);
  }

  // On an inactive customer OR a cancelled plan, only FUTURE months are blocked;
  // past + current months stay fully payable (record, quick-pay, bulk-pay). This
  // is the single gate all three pay paths share.
  function isPayBlocked(entry: MonthEntry): boolean {
    return (!customer.active || !lineActive) && isCalendarFuture(entry);
  }

  // Months are settled OLDEST FIRST: returns the oldest month that must be
  // collected before `entries` may be paid, or null when the pay is allowed.
  // Months inside the same write never block it, so paying a whole backlog in
  // one selection is fine while cherry-picking a later month is not.
  function payOrderBlocker(entries: MonthEntry[]): string | null {
    const blocking = blockingUnpaidMonths(
      lineUncoveredMonths,
      entries.map((e) => e.billingMonth),
    );
    return blocking[0] ?? null;
  }

  function showPayOrderBlocked(month: string) {
    void confirm({
      title: t("common.not_available"),
      message: t("payments.earlier_month_unpaid", {
        month: billingMonthLabel(month),
      }),
      confirmLabel: t("common.close"),
      hideCancel: true,
    });
  }

  // Voids run NEWEST FIRST (the mirror of the above): returns the newest paid
  // month that must be voided before `entries` may be, or null when allowed.
  // Months inside the same void never block it.
  function voidOrderBlocker(entries: MonthEntry[]): string | null {
    const blocking = blockingPaidMonths(
      linePaidMonths,
      // A block is voided whole, so the target is every month ITS payment covers
      // — read off the payment, since a secondary cell's own month is not the
      // block's start.
      entries.flatMap((e) =>
        e.payment
          ? coveredBillingMonths(
              e.payment.billingMonth,
              e.payment.durationMonths,
            )
          : [e.billingMonth],
      ),
    );
    return blocking[0] ?? null;
  }

  function showVoidOrderBlocked(month: string) {
    void confirm({
      title: t("common.not_available"),
      message: t("payments.later_month_paid", {
        month: billingMonthLabel(month),
      }),
      confirmLabel: t("common.close"),
      hideCancel: true,
    });
  }

  // An unskip is a void of an EXPECTATION, so it follows the void rule: it is
  // locked while a LATER month is paid, since it would leave an unpaid month
  // under a paid one. Returns that month, or null when the unskip is allowed.
  function unskipOrderBlocker(entries: MonthEntry[]): string | null {
    return (
      blockingPaidMonths(
        linePaidMonths,
        entries.map((e) => e.billingMonth),
      )[0] ?? null
    );
  }

  // A skipped month whose unskip is locked can never go back to unpaid, so
  // COLLECTING it is the only way left to settle it. It therefore joins the
  // payable statuses (a payment outranks the skip in buildMonthGrid, leaving the
  // skip inert) and its unskip action is hidden instead.
  function isLockedSkipped(entry: MonthEntry): boolean {
    return entry.status === "skipped" && unskipOrderBlocker([entry]) !== null;
  }

  // The statuses a payment can be recorded for: nothing collected yet, or a
  // skipped month that can no longer be unskipped.
  function isPayableStatus(entry: MonthEntry): boolean {
    return (
      entry.status === "unpaid" ||
      entry.status === "future" ||
      isLockedSkipped(entry)
    );
  }

  function handleCellPress(entry: MonthEntry) {
    if (entry.status === "before_start") {
      void confirm({
        title: t("common.not_available"),
        message: t("payments.before_start_date"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }

    // A skipped month is not payable — tapping it offers the unskip instead.
    // Checked before the inactive gate: unskipping is not a payment, so it stays
    // available on a cancelled plan / inactive customer. A locked skip has no
    // unskip left, so it falls through to the pay path below.
    if (entry.status === "skipped" && !isLockedSkipped(entry)) {
      setSkipRequest({ entries: [entry], mode: "unskip" });
      return;
    }

    // Future months are blocked when either the customer OR the line is inactive.
    if (isPayBlocked(entry)) {
      void confirm({
        title: t("common.not_available"),
        // Customer-inactive takes priority; otherwise it's the plan that's cancelled.
        message: !customer.active
          ? t("payments.inactive_future_blocked")
          : t("payments.cancelled_plan_future_blocked"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }

    setSelectedEntry(entry);

    if (entry.status === "paid" && entry.payment) {
      setDetailVisible(true);
      return;
    }

    // Older month still open → collect that one first.
    const blocker = payOrderBlocker([entry]);
    if (blocker) {
      showPayOrderBlocked(blocker);
      return;
    }

    setFormVisible(true);
  }

  // From the payment detail sheet. A newer paid month must go first, so say which
  // one instead of opening the void sheet.
  function handleVoidPress() {
    if (!selectedEntry) return;
    const blocker = voidOrderBlocker([selectedEntry]);
    if (blocker) {
      showVoidOrderBlocked(blocker);
      return;
    }
    setVoidVisible(true);
  }

  // Quick Pay is available on unpaid + future-status (prepay) months of a
  // fixed-price plan — custom-price / planless fall back to the form. A cancelled
  // plan (or inactive customer) can still quick-pay its PAST/CURRENT months;
  // only calendar-future months are blocked (isPayBlocked).
  function canQuickPay(entry: MonthEntry): boolean {
    return (
      !isPayBlocked(entry) &&
      payOrderBlocker([entry]) === null &&
      isPayableStatus(entry) &&
      plan != null &&
      !plan.isCustomPrice &&
      plan.price !== null
    );
  }

  function hasActivePayment(entry: MonthEntry): boolean {
    return (
      entry.status === "paid" &&
      entry.payment != null &&
      entry.payment.voidedAt === null
    );
  }

  // Sends ONE invoice covering every payment passed in — the months just
  // created by a pay, or already-paid months picked in the grid (the builder
  // totals them per currency either way). No-op when the write failed or the
  // customer has no number — the pay must still count as done.
  async function sendInvoiceFor(payments: Payment[]) {
    const rows = payments.filter((p) => p != null);
    if (rows.length === 0 || !canSend(customer.phoneNumber)) return;
    await sendPaymentInvoice({
      phone: customer.phoneNumber,
      customerName: customer.name,
      rows: rows.map((payment) => ({ payment, planName: plan?.name ?? null })),
    });
  }

  async function handleQuickPay(entry: MonthEntry, send = false) {
    if (
      !selectedLine ||
      !plan ||
      plan.isCustomPrice ||
      plan.price === null ||
      !user
    ) {
      setSelectedEntry(entry);
      setFormVisible(true);
      return;
    }
    const planCurrency = findCurrency(currencies, plan.currencyId);

    if (plan.durationMonths > 1) {
      if (!currentTier) return;
      const ok = await confirm({
        title: t("payments.quick_pay.confirm_multi_month_title"),
        message: t("payments.quick_pay.confirm_multi_month_message", {
          amount: formatMoney(plan.price, planCurrency, planCurrency),
          months: getBlockRangeLabel(
            entry.billingMonth,
            plan.durationMonths,
            t,
          ),
        }),
        confirmLabel: t("payments.quick_pay.confirm"),
      });
      if (!ok) return;
      setQuickPayMonth(entry.billingMonth);
      try {
        const result = await createMultiMonthPayment(
          entry.billingMonth,
          customer,
          selectedLine.id,
          plan,
          planCurrency,
          plan.price,
          user.id,
          null,
          user.tenantId,
          false,
          lines,
          year,
          currentTier,
        );
        if (send) await sendInvoiceFor(result ? [result.payment] : []);
      } finally {
        setQuickPayMonth(null);
      }
      return;
    }

    setQuickPayMonth(entry.billingMonth);
    try {
      const created = await createPayment(
        {
          billingMonth: entry.billingMonth,
          amountDue: plan.price,
          amountPaid: plan.price,
          durationMonths: 1,
          currencyId: plan.currencyId,
          customerId: customer.id,
          customerPlanId: selectedLine.id,
          planId: plan.id,
          receivedByUserId: user.id,
          tenantId: user.tenantId,
          notes: null,
        },
        planCurrency,
        lines,
      );
      if (send) await sendInvoiceFor(created ? [created] : []);
    } finally {
      setQuickPayMonth(null);
    }
  }

  function buildMonthMenuActions(entry: MonthEntry | null): ActionMenuItem[] {
    if (!entry) return [];
    const items: ActionMenuItem[] = [
      {
        key: "open",
        label: t("common.open"),
        icon: "open-outline",
        onPress: () => handleCellPress(entry),
      },
    ];
    if (canQuickPay(entry)) {
      items.push({
        key: "quick-pay",
        label: t("payments.quick_pay.pay_now"),
        icon: "flash-outline",
        onPress: () => void handleQuickPay(entry),
      });
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
        onPress: () => void handleQuickPay(entry, true),
      });
    }
    // Skip is offered on months with nothing to collect yet; a paid month must
    // be voided first, so the two actions never appear together.
    if (entry.status === "unpaid" || entry.status === "future") {
      items.push({
        key: "skip",
        label: t("payments.skip.skip_action"),
        icon: "play-skip-forward-outline",
        onPress: () => setSkipRequest({ entries: [entry], mode: "skip" }),
      });
    }
    // Unskip is dropped once a later month is paid — the month can only be
    // collected from here on, so the pay rows above are what's offered instead.
    if (entry.status === "skipped" && !isLockedSkipped(entry)) {
      items.push({
        key: "unskip",
        label: t("payments.skip.unskip_action"),
        icon: "refresh-outline",
        onPress: () => setSkipRequest({ entries: [entry], mode: "unskip" }),
      });
    }
    if (hasActivePayment(entry)) {
      items.push({
        key: "void",
        label: t("payments.void_payment"),
        icon: "close-circle-outline",
        destructive: true,
        // Kept visible when a newer month blocks it — pressing explains which
        // month to void first, rather than the row silently disappearing.
        onPress: () => {
          const blocker = voidOrderBlocker([entry]);
          if (blocker) {
            showVoidOrderBlocked(blocker);
            return;
          }
          setSelectedEntry(entry);
          setVoidVisible(true);
        },
      });
    }
    return items;
  }

  async function handleEditAmount(next: { amountPaid: number }) {
    if (!selectedEntry?.payment) return;
    await updatePayment(selectedEntry.payment.id, next.amountPaid, lines, year);
    if (!getStore().getState().payments.error) setDetailVisible(false);
  }

  // --- Multi-select (bulk) ---------------------------------------------------

  const selectedEntries = grid.filter((m) =>
    selection.selectedIds.has(m.billingMonth),
  );
  // Payable in bulk: unpaid, a future-status (prepay) slot, or a skipped month
  // whose unskip is locked — but never a calendar-future month on a cancelled
  // plan / inactive customer (isPayBlocked).
  const payableEntries = selectedEntries.filter(
    (e) => isPayableStatus(e) && !isPayBlocked(e),
  );
  const voidableEntries = selectedEntries.filter(
    (e) =>
      e.status === "paid" && e.payment != null && e.payment.voidedAt === null,
  );
  // The same rows as a receipt: one entry per PAYMENT, since a multi-month block
  // fills several cells from a single payment row and must be listed once.
  const selectedPayments = [
    ...new Map(
      voidableEntries.map((e) => [e.payment!.id, e.payment!]),
    ).values(),
  ];
  // Skippable = nothing collected yet on that month; unskippable = already
  // skipped, minus the ones a later paid month locked (collect those instead).
  const skippableEntries = selectedEntries.filter(
    (e) => e.status === "unpaid" || e.status === "future",
  );
  const skippedEntries = selectedEntries.filter(
    (e) => e.status === "skipped" && !isLockedSkipped(e),
  );

  function handleCellToggle(entry: MonthEntry) {
    if (!selectedLine) return;
    const unit = expandSelectionUnit(entry, grid, selectedLine);
    if (unit.length > 0) selection.toggleMany(unit);
  }

  function handleCellLongPress(entry: MonthEntry) {
    if (!selectedLine) return;
    const unit = expandSelectionUnit(entry, grid, selectedLine);
    if (unit.length > 0) selection.enterWith(unit);
  }

  function bulkSucceeded(): boolean {
    const ps = getStore().getState().payments;
    return !ps.error && !ps.tierLimitError;
  }

  function runBulkPay(send = false) {
    if (bulkBusy || payableEntries.length === 0) return;
    // The whole selection is judged at once, so a backlog selected together
    // passes while cherry-picking a later month does not.
    const blocker = payOrderBlocker(payableEntries);
    if (blocker) {
      showPayOrderBlocked(blocker);
      return;
    }
    if (!plan || plan.isCustomPrice) {
      // The custom-amount sheet asks for the amount first; it carries the send
      // intent to its own submit.
      setBulkPaySend(send);
      setBulkPayVisible(true);
    } else if (plan.durationMonths > 1) {
      void runBulkMultiMonthPay(send);
    } else {
      void runBulkFixedPay(send);
    }
  }

  async function runBulkFixedPay(send: boolean) {
    if (!user || !selectedLine || !plan || plan.price === null) return;
    const ok = await confirm({
      title: t("payments.quick_pay.pay_now"),
      message: t("payments.bulk_pay_message", { count: payableEntries.length }),
      confirmLabel: t("payments.quick_pay.pay_now"),
    });
    if (!ok) return;
    const planCurrency = findCurrency(currencies, plan.currencyId);
    const inputs = payableEntries.map((e) => ({
      billingMonth: e.billingMonth,
      amountDue: plan.price!,
      amountPaid: plan.price!,
      durationMonths: 1,
      currencyId: plan.currencyId,
      customerId: customer.id,
      customerPlanId: selectedLine.id,
      planId: plan.id,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
      notes: null,
    }));
    clearPaymentError();
    setBulkBusy(true);
    try {
      const created = await createPayments(inputs, planCurrency, lines, year);
      if (send) await sendInvoiceFor(created);
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) selection.clear();
  }

  async function runBulkMultiMonthPay(send: boolean) {
    if (!user || !selectedLine || !plan || plan.price === null || !currentTier)
      return;
    const blocks = groupPayableBlocks(payableEntries, selectedLine);
    const ok = await confirm({
      title: t("payments.quick_pay.pay_now"),
      message: t("payments.bulk_pay_blocks_message", { count: blocks.length }),
      confirmLabel: t("payments.quick_pay.pay_now"),
    });
    if (!ok) return;
    const planCurrency = findCurrency(currencies, plan.currencyId);
    clearPaymentError();
    clearPaymentTierLimitError();
    setBulkBusy(true);
    try {
      const result = await createMultiMonthPayments(
        blocks.map((b) => b.startBillingMonth),
        customer,
        selectedLine.id,
        plan,
        planCurrency,
        plan.price,
        user.id,
        null,
        user.tenantId,
        lines,
        year,
        currentTier,
      );
      if (send) await sendInvoiceFor(result?.payments ?? []);
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) selection.clear();
  }

  async function runBulkCustomPay(values: BulkPaymentValues) {
    if (!user || !selectedLine) return;
    const currency = findCurrency(currencies, values.currencyId);
    const inputs = payableEntries.map((e) => ({
      billingMonth: e.billingMonth,
      amountDue: values.amountDue,
      amountPaid: values.amountPaid,
      durationMonths: 1,
      currencyId: values.currencyId,
      customerId: customer.id,
      customerPlanId: selectedLine.id,
      planId: selectedLine.planId,
      receivedByUserId: user.id,
      tenantId: user.tenantId,
      notes: null,
    }));
    clearPaymentError();
    setBulkBusy(true);
    try {
      const created = await createPayments(inputs, currency, lines, year);
      if (bulkPaySend) await sendInvoiceFor(created);
    } finally {
      setBulkBusy(false);
    }
    if (bulkSucceeded()) {
      setBulkPayVisible(false);
      selection.clear();
    }
  }

  function runBulkVoid() {
    if (bulkBusy || voidableEntries.length === 0) return;
    // The whole selection is judged at once, so voiding a paid tail together
    // passes while cherry-picking an older month out of it does not.
    const blocker = voidOrderBlocker(voidableEntries);
    if (blocker) {
      showVoidOrderBlocked(blocker);
      return;
    }
    const ids = Array.from(new Set(voidableEntries.map((e) => e.payment!.id)));
    setBulkVoidIds(ids);
  }

  async function sendSelectedInvoice() {
    await sendInvoiceFor(selectedPayments);
    selection.clear();
  }

  const selectionActions: SelectionAction[] = [];
  if (payableEntries.length > 0) {
    selectionActions.push({
      key: "pay",
      icon: "flash-outline",
      label: t("payments.quick_pay.pay_now"),
      disabled: bulkBusy,
      onPress: () => runBulkPay(),
    });
    // One invoice for the whole selection — hidden (not disabled) without a
    // number, since the toolbar is icon-sized and has nowhere for a caption.
    if (canSend(customer.phoneNumber)) {
      selectionActions.push({
        key: "pay-whatsapp",
        icon: "logo-whatsapp",
        renderIcon: (size) => <WhatsAppComboIcon variant="pay" size={size} />,
        label: t("invoice.pay_and_send_whatsapp"),
        disabled: bulkBusy,
        onPress: () => runBulkPay(true),
      });
    }
  }
  if (skippableEntries.length > 0) {
    selectionActions.push({
      key: "skip",
      icon: "play-skip-forward-outline",
      label: t("payments.skip.skip_action"),
      disabled: bulkBusy,
      onPress: () =>
        setSkipRequest({ entries: skippableEntries, mode: "skip" }),
    });
  }
  if (skippedEntries.length > 0) {
    selectionActions.push({
      key: "unskip",
      icon: "refresh-outline",
      label: t("payments.skip.unskip_action"),
      disabled: bulkBusy,
      onPress: () =>
        setSkipRequest({ entries: skippedEntries, mode: "unskip" }),
    });
  }
  // Re-send the receipt for months already collected. Hidden (not disabled)
  // without a number, like the pay-and-send action above.
  if (selectedPayments.length > 0 && canSend(customer.phoneNumber)) {
    selectionActions.push({
      key: "send-invoice",
      icon: "receipt-outline",
      renderIcon: (size) => <WhatsAppComboIcon variant="report" size={size} />,
      label: t("invoice.send_invoice_whatsapp"),
      disabled: bulkBusy,
      onPress: () => void sendSelectedInvoice(),
    });
  }
  if (voidableEntries.length > 0) {
    selectionActions.push({
      key: "void",
      icon: "close-circle-outline",
      label: t("payments.void_payment"),
      destructive: true,
      disabled: bulkBusy,
      onPress: runBulkVoid,
    });
  }

  const { year: cy, month: cm } = getCurrentYearMonth();
  const currentMonthEntry = grid.find((m) => m.year === cy && m.month === cm);
  const showUnpaidBanner =
    customer.isRegular &&
    lineActive &&
    currentMonthEntry?.status === "unpaid" &&
    year === cy;
  const daysIntoMonth = new Date().getDate();

  const paidCount = grid.filter((m) => m.status === "paid").length;
  const unpaidCount = grid.filter((m) => m.status === "unpaid").length;
  const skippedCount = grid.filter((m) => m.status === "skipped").length;
  const collectedTotalUsd = payments
    .filter(
      (p) =>
        !p.voidedAt &&
        p.customerPlanId === selectedLine?.id &&
        p.billingMonth.startsWith(String(year)),
    )
    .reduce(
      (sum, p) =>
        sum + toUsd(p.amountPaid, paymentSnapshotCurrency(p, currencies)),
      0,
    );
  const collectedTotalLabel = formatMoney(
    collectedTotalUsd,
    null,
    displayCurrency,
  );

  const canEditAmount =
    selectedEntry?.payment != null &&
    !selectedEntry.isGroupSecondary &&
    selectedEntry.payment.voidedAt === null;

  // Back-limit for the year navigator: the selected line's start year, or —
  // before a line is selected — the earliest of all the customer's lines.
  const minYear = selectedLine
    ? new Date(selectedLine.startDate).getFullYear()
    : Math.min(
        ...lines.map((l) => new Date(l.startDate).getFullYear()),
        getCurrentYearMonth().year,
      );

  // Swipe left/right on the grid steps the year (forward = next year, back =
  // previous, clamped at the line's start year like the chevron buttons).
  const stepYear = useCallback(
    (delta: number) =>
      setYear((y) => (delta < 0 && y <= minYear ? y : y + delta)),
    [minYear],
  );
  const yearSwipe = useHorizontalSwipe({
    onNext: () => stepYear(1),
    onPrev: () => stepYear(-1),
  });

  // Empty state — a customer with no service lines (rare: every customer keeps
  // ≥1 line, managed from the customer form's Plans editor).
  if (lines.length === 0) {
    return (
      <View className="bg-white mx-4 mt-4 rounded-2xl border border-gray-100 px-4 py-8 items-center">
        <Ionicons name="albums-outline" size={28} color={COLORS.gray400} />
        <Text className="text-sm text-gray-500 mt-2 text-center">
          {t("subscriptions.empty")}
        </Text>
      </View>
    );
  }

  return (
    <>
      {paymentsError ? (
        <View className="px-4 mt-4">
          <ErrorBanner message={paymentsError} onDismiss={clearPaymentError} />
        </View>
      ) : null}

      {/* Service-line selector — view only (add/edit/remove plans from the
          customer form). Hidden when there's a single line so a one-plan
          customer looks exactly like before. */}
      {lines.length > 1 && (
        <View className="mx-4 mt-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {lines.map((line) => {
              const isSel = line.id === selectedLineId;
              const dot = lineIndicatorStatus(
                monthGridsByLine[line.id] ?? EMPTY_GRID,
              );
              return (
                <PressableOpacity
                  key={line.id}
                  onPress={() => setSelectedLineId(line.id)}
                  className={`flex-row items-center rounded-full px-3 py-1.5 border ${
                    isSel
                      ? "bg-gray-900 border-gray-900"
                      : "bg-white border-gray-200"
                  } ${line.active ? "" : "opacity-50"}`}
                >
                  {dot ? (
                    <View
                      className={`w-2 h-2 rounded-full me-1.5 ${INDICATOR_DOT[dot]}`}
                    />
                  ) : null}
                  <Text
                    fontWeight="SemiBold"
                    className={`text-xs ${isSel ? "text-white" : "text-gray-700"}`}
                    numberOfLines={1}
                  >
                    {lineLabel(line, t("common.no_plan"))}
                    {line.active ? "" : ` · ${t("subscriptions.cancelled")}`}
                  </Text>
                </PressableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Year card */}
      <GestureDetector gesture={yearSwipe}>
        <View className="bg-white mx-4 mt-3 rounded-2xl border border-gray-100 overflow-hidden">
          <View className="relative">
            <View className="px-4 pt-4 pb-2">
              {/* Selected line header — the plan this grid is for, plus its price. */}
              {selectedLine ? (
                <View className="mb-1 flex-row items-baseline">
                  <Text
                    fontWeight="SemiBold"
                    className="text-sm text-gray-700 shrink"
                    numberOfLines={1}
                  >
                    {lineLabel(selectedLine, t("common.no_plan"))}
                    {selectedLine.active
                      ? ""
                      : ` · ${t("subscriptions.cancelled")}`}
                  </Text>
                  {linePriceLabel ? (
                    <Text
                      className="text-xs text-gray-400 ms-2"
                      numberOfLines={1}
                    >
                      · {linePriceLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Row 1 — year + year navigation */}
              <View className="flex-row items-center justify-between">
                <Text fontWeight="Bold" className="text-2xl text-gray-900">
                  {year}
                </Text>
                <View className="flex-row gap-2">
                  <PressableOpacity
                    onPress={() => setYear((y) => y - 1)}
                    disabled={year <= minYear}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: COLORS.primaryLight,
                      opacity: year <= minYear ? 0.35 : 1,
                    }}
                  >
                    <DirectionalIcon
                      name="chevron-back"
                      size={20}
                      color={COLORS.primary}
                    />
                  </PressableOpacity>
                  <PressableOpacity
                    onPress={() => setYear((y) => y + 1)}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: COLORS.primaryLight }}
                  >
                    <DirectionalIcon
                      name="chevron-forward"
                      size={20}
                      color={COLORS.primary}
                    />
                  </PressableOpacity>
                </View>
              </View>
              {/* Row 2 — year summary chips */}
              <View className="flex-row items-center flex-wrap mt-1.5 gap-1.5">
                <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                  <Text fontWeight="SemiBold" className="text-xs text-gray-900">
                    {paidCount}
                  </Text>
                  <Text className="text-xs text-gray-500 ms-1">
                    {t("customers.year_paid").toLowerCase()}
                  </Text>
                </View>
                <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                  <Text fontWeight="SemiBold" className="text-xs text-gray-900">
                    {unpaidCount}
                  </Text>
                  <Text className="text-xs text-gray-500 ms-1">
                    {t("customers.year_unpaid").toLowerCase()}
                  </Text>
                </View>
                {skippedCount > 0 ? (
                  <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                    <Text
                      fontWeight="SemiBold"
                      className="text-xs text-gray-900"
                    >
                      {skippedCount}
                    </Text>
                    <Text className="text-xs text-gray-500 ms-1">
                      {t("payments.skip.skipped_label").toLowerCase()}
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                  <Text fontWeight="SemiBold" className="text-xs text-gray-900">
                    {collectedTotalLabel}
                  </Text>
                  <Text className="text-xs text-gray-500 ms-1">
                    {t("customers.year_collected").toLowerCase()}
                  </Text>
                </View>
              </View>
            </View>
            {selection.active ? (
              <View className="absolute inset-0 bg-white px-2 justify-center border-b border-gray-100">
                <InlineSelectionToolbar
                  count={selection.count}
                  actions={selectionActions}
                  onClose={selection.clear}
                />
              </View>
            ) : null}
          </View>

          {paymentsLoading ? (
            <View className="h-40 items-center justify-center">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <MonthGrid
              months={grid}
              onCellPress={handleCellPress}
              onCellMenu={setMenuEntry}
              loadingBillingMonth={quickPayMonth}
              isRegular={customer.isRegular}
              selectionMode={selection.active}
              isSelected={(bm) => selection.selectedIds.has(bm)}
              onCellToggle={handleCellToggle}
              onCellLongPress={handleCellLongPress}
            />
          )}
        </View>
      </GestureDetector>

      {/* Unpaid banner */}
      {showUnpaidBanner && currentMonthEntry ? (
        <View className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex-row items-center">
          <Text className="text-base me-2">⚠️</Text>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-red-600">
              {new Date().toLocaleDateString(locale, {
                month: "long",
                year: "numeric",
              })}{" "}
              {t("dashboard.unpaid")}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              {t("payments.amount_due")} · {daysIntoMonth} days into the month
            </Text>
          </View>
          {/* Collects straight away — falls back to the form only when the line
              has no fixed price to charge (handleQuickPay opens it itself). */}
          <PressableOpacity
            onPress={() => void handleQuickPay(currentMonthEntry)}
            disabled={quickPayMonth === currentMonthEntry.billingMonth}
            className="bg-red-500 rounded-xl px-3 py-2 ms-2"
          >
            {quickPayMonth === currentMonthEntry.billingMonth ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white text-sm font-semibold">
                {t("payments.collect")}
              </Text>
            )}
          </PressableOpacity>
        </View>
      ) : null}

      {formVisible && selectedEntry && selectedLine && (
        <PaymentFormSheet
          entry={selectedEntry}
          customer={customer}
          line={selectedLine}
          lines={lines}
          monthGrid={grid}
          onDismiss={() => setFormVisible(false)}
        />
      )}
      {detailVisible && selectedEntry && (
        <PaymentDetailSheet
          entry={selectedEntry}
          recipient={{ name: customer.name, phone: customer.phoneNumber }}
          planName={plan?.name ?? null}
          onVoid={handleVoidPress}
          onEdit={canEditAmount ? handleEditAmount : undefined}
          editLoading={loadingUpdate}
          onDismiss={() => setDetailVisible(false)}
        />
      )}
      {voidVisible && selectedEntry && (
        <VoidSheet
          entry={selectedEntry}
          lines={lines}
          year={year}
          onDismiss={() => {
            setDetailVisible(false);
            setVoidVisible(false);
          }}
        />
      )}

      {bulkPayVisible && (
        <BulkPaymentFormSheet
          count={payableEntries.length}
          submitting={bulkBusy}
          onConfirm={runBulkCustomPay}
          sendToPhone={bulkPaySend ? customer.phoneNumber : null}
          onDismiss={() => {
            setBulkPayVisible(false);
            setBulkPaySend(false);
          }}
        />
      )}
      {skipRequest && selectedLine && (
        <SkipMonthSheet
          entries={skipRequest.entries}
          mode={skipRequest.mode}
          customerId={customer.id}
          line={selectedLine}
          lines={lines}
          year={year}
          onDone={() => {
            setSkipRequest(null);
            selection.clear();
          }}
          onDismiss={() => setSkipRequest(null)}
        />
      )}

      {bulkVoidIds && (
        <BulkVoidSheet
          paymentIds={bulkVoidIds}
          lines={lines}
          year={year}
          onVoided={() => {
            setBulkVoidIds(null);
            selection.clear();
          }}
          onDismiss={() => setBulkVoidIds(null)}
        />
      )}

      <UpgradePromptModal
        payload={paymentsTierLimitError}
        onClose={clearPaymentTierLimitError}
      />

      <ActionMenu
        visible={menuEntry !== null}
        title={
          menuEntry
            ? `${t(`months.${menuEntry.label}`)} ${menuEntry.year}`
            : undefined
        }
        actions={buildMonthMenuActions(menuEntry)}
        onDismiss={() => setMenuEntry(null)}
      />
    </>
  );
}
