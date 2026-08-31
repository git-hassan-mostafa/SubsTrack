import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, InteractionManager, ScrollView, View } from "react-native";
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
  Collection,
  Customer,
  CustomerPlan,
  MonthEntry,
  OpenItem,
} from "@/src/core/types";
import { getCurrentYearMonth, getDateLocale } from "@/src/core/utils/date";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { COLORS } from "@/src/shared/constants";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";
import { resolveLinePrice } from "@/src/modules/customer/customer-plans/utils/linePrice";
import { MonthGrid } from "./MonthGrid";
import { SkipMonthSheet } from "./SkipMonthSheet";
import { expandSelectionUnit, groupPayableBlocks } from "../utils/monthSelection";
import {
  billingMonthLabel,
  blockingPaidMonths,
  blockingUnpaidMonths,
} from "../utils/payOrder";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { SelectionAction } from "@/src/shared/components/PageHeader";
import { useSendInvoice, WhatsAppComboIcon } from "@/src/modules/invoicing";
import { BillSheet, CollectSheet, monthItemFromEntry } from "@/src/modules/ledger";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";

interface CustomerPaymentPanelProps {
  customer: Customer;
  // Bumped by the screen's pull-to-refresh. The grid is NOT reloaded on focus
  // (that would re-query every time a sheet closes), so this is what picks up a
  // month paid or voided on another device and synced down.
  refreshToken?: number;
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

export function CustomerPaymentPanel({
  customer,
  refreshToken = 0,
}: CustomerPaymentPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const router = useRouter();
  const { quickPay } = useLocalSearchParams<{ quickPay?: string }>();
  const { user } = useAuth();
  // Per-field selectors, never `usePaymentSlice()` bare: subscribing to the whole
  // slice re-renders this panel (month grid included) on every unrelated change,
  // and hands every effect a dep that changes identity each time.
  const bills = usePaymentSlice((s) => s.bills);
  const monthGridsByLine = usePaymentSlice((s) => s.monthGridsByLine);
  const uncoveredMonthsByLine = usePaymentSlice((s) => s.uncoveredMonthsByLine);
  const paidMonthsByLine = usePaymentSlice((s) => s.paidMonthsByLine);
  const paymentsLoading = usePaymentSlice((s) => s.loading);
  const paymentsError = usePaymentSlice((s) => s.error);
  const fetchBills = usePaymentSlice((s) => s.fetchBills);
  const applyCollection = usePaymentSlice((s) => s.applyCollection);
  const clearPaymentError = usePaymentSlice((s) => s.clearError);
  const resetPayments = usePaymentSlice((s) => s.reset);
  const collect = useLedgerSlice((s) => s.collect);
  const collecting = useLedgerSlice((s) => s.loadingCollect);
  const ledgerError = useLedgerSlice((s) => s.error);
  const clearLedgerError = useLedgerSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const { canSend, sendCollectionInvoice } = useSendInvoice();
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
  const [menuEntry, setMenuEntry] = useState<MonthEntry | null>(null);
  const [quickPayMonth, setQuickPayMonth] = useState<string | null>(null);
  // The bill a "paid" cell opened — its own sheet lists every payment on it.
  const [billEntry, setBillEntry] = useState<MonthEntry | null>(null);
  // What the collect sheet is about to take money for. One item = one month;
  // several = a multi-select, split oldest-first by the waterfall.
  const [collectFor, setCollectFor] = useState<{
    items: OpenItem[];
    single: boolean;
    send: boolean;
  } | null>(null);
  const quickPayHandledRef = useRef(false);

  const selection = useSelection();
  useSelectionBackHandler(selection.active, selection.clear);
  // Set while a multi-select collect is in flight — the toolbar greys out.
  const bulkBusy = collecting;
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
  // What this line costs — the plan's price, or the customer's own special price.
  // Every amount and rate-snapshot currency below comes from here, never plan.price.
  const linePrice = resolveLinePrice(
    selectedLine ?? { customPrice: null, customCurrencyId: null, plan: null },
  );
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
  // The same, for the months this line HAS paid — a later paid month can sit
  // outside the viewed year and still lock an unskip.
  const linePaidMonths = selectedLine
    ? (paidMonthsByLine[selectedLine.id] ?? EMPTY_MONTHS)
    : EMPTY_MONTHS;

  // Price shown next to the plan name above the grid. A custom-price or
  // plan-less line has no fixed amount, so it reads "Custom" instead. Multi-month
  // plans say so, since the price covers the whole block, not one month.
  const linePriceLabel = (() => {
    if (!selectedLine) return null;
    if (!linePrice.isFixed) return t("common.custom");
    const amount = formatMoney(
      linePrice.amount!,
      findCurrency(currencies, linePrice.currencyId),
      displayCurrency,
    );
    // `subscription.per_month` is already slash-prefixed ("/ month") in both locales.
    const withPeriod =
      linePrice.durationMonths > 1
        ? `${amount} / ${t("plans.n_months", { count: linePrice.durationMonths })}`
        : `${amount} ${t("subscription.per_month")}`;
    // Flag a privately negotiated figure so it isn't read as the catalog price —
    // for a bundle price too, which can now also be a line's own.
    return linePrice.kind === "special"
      ? `${withPeriod} · ${t("subscriptions.special_badge")}`
      : withPeriod;
  })();

  // Loads every line's bills for the viewed customer/year. Always a real read
  // (there is no cached companion): a cache keyed on the customer id would keep
  // serving the pre-sync grid after a month was paid or voided elsewhere.
  // Mount, year/line changes, and pull-to-refresh (`refreshToken`) only — NOT
  // focus, so returning from a sheet costs no query.
  useEffect(() => {
    if (lines.length > 0) {
      void fetchBills(customer.id, lines, year);
    }
  }, [customer.id, year, linesKey, lines, fetchBills, refreshToken]);

  // `selection.clear` (not `selection`) — the hook returns a fresh object each
  // render, so depending on it would loop.
  const clearGridSelection = selection.clear;
  useEffect(() => {
    clearGridSelection();
  }, [year, selectedLineId, clearGridSelection]);

  useEffect(() => {
    return () => resetPayments();
  }, [resetPayments]);

  const lineActive = selectedLine?.active ?? false;

  // Calendar-future month (strictly after the current month) — the same thing
  // the "future" grid STATUS means for an unpaid month.
  function isCalendarFuture(entry: MonthEntry): boolean {
    const { year: cy, month: cm } = getCurrentYearMonth();
    return entry.year > cy || (entry.year === cy && entry.month > cm);
  }

  // On an inactive customer OR a cancelled plan, only FUTURE months are blocked;
  // past + current months stay fully payable. This is the single gate all the
  // collect paths share.
  function isPayBlocked(entry: MonthEntry): boolean {
    return (!customer.active || !lineActive) && isCalendarFuture(entry);
  }

  // Months are settled OLDEST FIRST: returns the oldest month that must be
  // collected before `entries` may be paid, or null when the pay is allowed.
  // Months inside the same write never block it, so paying a whole backlog in
  // one selection is fine while cherry-picking a later month is not.
  function payOrderBlocker(entries: MonthEntry[]): string | null {
    return (
      blockingUnpaidMonths(
        lineUncoveredMonths,
        entries.map((e) => e.billingMonth),
      )[0] ?? null
    );
  }

  const showPayOrderBlocked = useCallback((month: string) => {
    void confirm({
      title: t("common.not_available"),
      message: t("payments.earlier_month_unpaid", {
        month: billingMonthLabel(month),
      }),
      confirmLabel: t("common.close"),
      hideCancel: true,
    });
  }, [t]);

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
  // payable statuses (money outranks the skip in buildMonthGrid, leaving the
  // skip inert) and its unskip action is hidden instead.
  function isLockedSkipped(entry: MonthEntry): boolean {
    return entry.status === "skipped" && unskipOrderBlocker([entry]) !== null;
  }

  // The statuses money can be collected for: nothing collected yet, or a
  // skipped month that can no longer be unskipped.
  function isPayableStatus(entry: MonthEntry): boolean {
    return (
      entry.status === "unpaid" ||
      entry.status === "future" ||
      isLockedSkipped(entry)
    );
  }

  // ── Turning cells into collectable items ───────────────────────────────

  const monthLabelOf = useCallback((entry: MonthEntry): string => {
    const span = entry.charge?.durationMonths ?? linePrice.durationMonths;
    const base =
      span > 1
        ? getBlockRangeLabel(entry.billingMonth, span, t)
        : `${t(`months.${entry.label}`)} ${entry.year}`;
    return plan?.name ? `${base} · ${plan.name}` : base;
  }, [linePrice.durationMonths, plan?.name, t]);

  // A cell as something money can be put against. Null only when no line is
  // selected — a line with no set price still opens, with the amount left for
  // staff to type (see `openAmount` on OpenItem).
  const itemFor = useCallback((entry: MonthEntry): OpenItem | null => {
    if (!selectedLine) return null;
    return monthItemFromEntry({
      entry,
      customerId: customer.id,
      customerName: customer.name,
      branchId: customer.branchId,
      customerPlanId: selectedLine.id,
      planId: selectedLine.planId,
      label: monthLabelOf(entry),
      price: {
        amount: linePrice.amount,
        currencyId: linePrice.currencyId,
        durationMonths: linePrice.durationMonths,
      },
      ratePerUsd: findCurrency(currencies, linePrice.currencyId)?.ratePerUsd ?? 1,
    });
  }, [selectedLine, customer, linePrice, currencies, monthLabelOf]);

  /**
   * The items a selection of payable cells becomes.
   *
   * On a multi-month plan the cells of one block share a single bill, so they
   * collapse to ONE item per block — otherwise a 3-month plan would be billed
   * three times for the same period.
   */
  const itemsForEntries = useCallback((entries: MonthEntry[]): OpenItem[] => {
    if (!selectedLine) return [];
    if (linePrice.durationMonths > 1) {
      const blocks = groupPayableBlocks(entries, selectedLine);
      return blocks
        .map((b) => {
          const cell =
            entries.find((e) => e.billingMonth === b.startBillingMonth) ??
            entries.find((e) => e.billingMonth >= b.startBillingMonth);
          if (!cell) return null;
          // The block is billed from its START month, whichever cell was tapped.
          return itemFor({ ...cell, billingMonth: b.startBillingMonth });
        })
        .filter((i): i is OpenItem => i !== null);
    }
    return entries.map(itemFor).filter((i): i is OpenItem => i !== null);
  }, [selectedLine, linePrice, itemFor]);

  const openCollect = useCallback((entries: MonthEntry[], send = false) => {
    const items = itemsForEntries(entries);
    if (items.length === 0) return;
    // A line with no set price has no amount to split, so each month needs its
    // own typed figure — one at a time.
    if (items.length > 1 && items.some((i) => i.openAmount)) {
      void confirm({
        title: t("common.not_available"),
        message: t("ledger.open_amount_one_at_a_time"),
        confirmLabel: t("common.close"),
        hideCancel: true,
      });
      return;
    }
    setCollectFor({ items, single: items.length === 1, send });
    // itemsForEntries is memoised by React Compiler; `t` is the only other read.
  }, [itemsForEntries, t]);

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
    // unskip left, so it falls through to the collect path below.
    if (entry.status === "skipped" && !isLockedSkipped(entry)) {
      setSkipRequest({ entries: [entry], mode: "unskip" });
      return;
    }

    // A month money has reached opens its BILL — which lists every payment made
    // against it, and is where one of them can be voided.
    if (entry.status === "paid" && entry.charge) {
      setBillEntry(entry);
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

    // Older month still open → collect that one first.
    const blocker = payOrderBlocker([entry]);
    if (blocker) {
      showPayOrderBlocked(blocker);
      return;
    }

    openCollect([entry]);
  }

  // Re-arm once the param is cleared, so arriving here a second time on the
  // same mounted screen still opens the sheet instead of doing nothing.
  useEffect(() => {
    if (quickPay !== "1") quickPayHandledRef.current = false;
  }, [quickPay]);

  // ?quickPay=1 handshake from the customer list: collect the current month of
  // the (first) selected line once its grid is ready. Fires at most once.
  useEffect(() => {
    if (quickPay !== "1" || quickPayHandledRef.current) return;
    if (paymentsLoading || grid.length === 0) return;
    const { year: cy, month: cm } = getCurrentYearMonth();
    const currentEntry = grid.find((m) => m.year === cy && m.month === cm);
    if (!currentEntry) return;
    quickPayHandledRef.current = true;
    router.setParams({ quickPay: undefined });
    // A skipped month can't be paid — explain instead of opening the sheet.
    // Unless a later paid month locked its unskip: collecting it is then the
    // only way to settle it, so the sheet opens as usual.
    if (
      currentEntry.status === "skipped" &&
      blockingPaidMonths(linePaidMonths, [currentEntry.billingMonth]).length === 0
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
      showPayOrderBlocked(blocker);
      return;
    }
    // Wait for the push animation to finish before presenting the sheet: a
    // bottom sheet presented mid-transition can end up never opening, which is
    // why the plain-modal dialogs above always showed and this did not.
    const task = InteractionManager.runAfterInteractions(() =>
      openCollect([currentEntry]),
    );
    return () => task.cancel();
    // The ref guard is what keeps this to a single firing; the deps are listed
    // in full because React Compiler memoises the callbacks (never disable the
    // hooks lint — it switches the compiler off for the whole file).
  }, [
    quickPay,
    paymentsLoading,
    grid,
    lineUncoveredMonths,
    linePaidMonths,
    router,
    t,
    openCollect,
    showPayOrderBlocked,
  ]);

  // ── Collecting ─────────────────────────────────────────────────────────

  /**
   * Sends ONE receipt for a hand-over — the split it covers is listed inside.
   * No-op when the write failed or the customer has no number: the money must
   * still count as collected.
   */
  async function sendReceipt(collection: Collection | null) {
    if (!collection || !canSend(customer.phoneNumber)) return;
    await sendCollectionInvoice({
      phone: customer.phoneNumber,
      customerName: customer.name,
      collection,
    });
  }

  /** Everything the grid writes goes through here — one door, one refresh. */
  async function runCollect(args: {
    items: OpenItem[];
    amount: number;
    currencyId: string | null;
    ratePerUsdSnapshot: number;
    receivedAt: string;
    notes: string | null;
    lines: { item: OpenItem; amount: number }[];
    send: boolean;
  }): Promise<boolean> {
    if (!user) return false;
    const created = await collect({
      tenantId: user.tenantId,
      customerId: customer.id,
      branchId: customer.branchId,
      amount: args.amount,
      currencyId: args.currencyId,
      ratePerUsdSnapshot: args.ratePerUsdSnapshot,
      receivedAt: args.receivedAt,
      receivedByUserId: user.id,
      notes: args.notes,
      lines: args.lines.map((l) => ({
        item: l.item,
        amount: l.amount,
        settles: l.amount >= l.item.balance,
      })),
    });
    if (!created) return false;
    // The created row carries its split and each bill it settled, so the grid
    // repaints from what is already in hand — no reload, no blink.
    applyCollection(created, lines, year);
    if (args.send) await sendReceipt(created);
    return true;
  }

  // Quick Pay: the full price of the month, in one tap. Available on unpaid +
  // future-status (prepay) months of a fixed-price line — a custom-price line
  // falls back to the sheet, which is where an amount can be typed.
  function canQuickPay(entry: MonthEntry): boolean {
    return (
      !isPayBlocked(entry) &&
      payOrderBlocker([entry]) === null &&
      isPayableStatus(entry) &&
      linePrice.isFixed
    );
  }

  async function handleQuickPay(entry: MonthEntry, send = false) {
    if (!selectedLine || !linePrice.isFixed || !user) {
      openCollect([entry], send);
      return;
    }
    const items = itemsForEntries([entry]);
    const item = items[0];
    if (!item) {
      openCollect([entry], send);
      return;
    }
    if (linePrice.durationMonths > 1) {
      const ok = await confirm({
        title: t("payments.quick_pay.confirm_multi_month_title"),
        message: t("payments.quick_pay.confirm_multi_month_message", {
          amount: formatMoney(
            item.balance,
            findCurrency(currencies, item.currencyId),
            displayCurrency,
          ),
          months: getBlockRangeLabel(
            item.billingMonth!,
            item.durationMonths,
            t,
          ),
        }),
        confirmLabel: t("payments.quick_pay.confirm"),
      });
      if (!ok) return;
    }
    setQuickPayMonth(entry.billingMonth);
    try {
      await runCollect({
        items,
        amount: item.balance,
        currencyId: item.currencyId,
        ratePerUsdSnapshot: item.ratePerUsdSnapshot,
        receivedAt: new Date().toISOString(),
        notes: null,
        lines: [{ item, amount: item.balance }],
        send,
      });
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
      // Part of the price now, the rest later — the sheet is where an amount
      // below the full one is typed.
      items.push({
        key: "collect-part",
        label: t("ledger.collect_part"),
        icon: "cash-outline",
        onPress: () => openCollect([entry]),
      });
    }
    // Skip is offered on months with nothing to collect yet; a paid month must
    // have its payment voided first, so the two actions never appear together.
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
    // A month money has reached: its bill lists every payment on it, and a
    // payment is voided from there. There is no "void the month" any more — one
    // hand-over can cover several months, so only the payment can be undone.
    if (entry.status === "paid" && entry.charge) {
      items.push({
        key: "bill",
        label: t("ledger.view_bill"),
        icon: "receipt-outline",
        onPress: () => setBillEntry(entry),
      });
      if (entry.balance > 0) {
        items.push({
          key: "collect-remaining",
          label: t("ledger.collect_rest"),
          icon: "cash-outline",
          onPress: () => openCollect([entry]),
        });
      }
    }
    return items;
  }

  // --- Multi-select (bulk) ---------------------------------------------------

  const selectedEntries = grid.filter((m) =>
    selection.selectedIds.has(m.billingMonth),
  );
  // Payable in bulk: unpaid, a future-status (prepay) slot, a skipped month
  // whose unskip is locked, or a partly-paid month with a balance left — but
  // never a calendar-future month on a cancelled plan / inactive customer.
  const payableEntries = selectedEntries.filter(
    (e) =>
      !isPayBlocked(e) &&
      (isPayableStatus(e) || (e.status === "paid" && e.balance > 0)),
  );
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

  function runBulkPay(send = false) {
    if (bulkBusy || payableEntries.length === 0) return;
    // The whole selection is judged at once, so a backlog selected together
    // passes while cherry-picking a later month does not.
    const blocker = payOrderBlocker(payableEntries);
    if (blocker) {
      showPayOrderBlocked(blocker);
      return;
    }
    openCollect(payableEntries, send);
  }

  const selectionActions: SelectionAction[] = [];
  if (payableEntries.length > 0) {
    selectionActions.push({
      key: "pay",
      icon: "cash-outline",
      label: t("payments.collect"),
      disabled: bulkBusy,
      onPress: () => runBulkPay(),
    });
    // One receipt for the whole hand-over — hidden (not disabled) without a
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
      onPress: () => setSkipRequest({ entries: skippableEntries, mode: "skip" }),
    });
  }
  if (skippedEntries.length > 0) {
    selectionActions.push({
      key: "unskip",
      icon: "refresh-outline",
      label: t("payments.skip.unskip_action"),
      disabled: bulkBusy,
      onPress: () => setSkipRequest({ entries: skippedEntries, mode: "unskip" }),
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
  // Collected in the viewed year, from the bills themselves — each converted at
  // the rate its own bill froze, so an edited rate never moves last year's total.
  const collectedTotalUsd = bills
    .filter(
      (b) =>
        b.charge.customerPlanId === selectedLine?.id &&
        (b.charge.billingMonth ?? "").startsWith(String(year)),
    )
    .reduce((sum, b) => sum + b.collected / b.charge.ratePerUsdSnapshot, 0);
  const collectedTotalLabel = formatMoney(
    collectedTotalUsd,
    null,
    displayCurrency,
  );

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

  const error = paymentsError ?? ledgerError;
  const clearErrors = () => {
    clearPaymentError();
    clearLedgerError();
  };

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
      {error ? (
        <View className="px-4 mt-4">
          <ErrorBanner message={error} onDismiss={clearErrors} />
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

          {/* Spinner only on the FIRST load — a pull-to-refresh keeps the built
              grid on screen under the refresh control, instead of blinking it
              out and back. */}
          {paymentsLoading && grid.length === 0 ? (
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
          {/* Collects straight away — falls back to the sheet only when the line
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

      {collectFor && (
        <CollectSheet
          visible
          customerName={customer.name}
          owed={collectFor.items}
          singleItem={collectFor.single ? collectFor.items[0] : null}
          loading={collecting}
          onSubmit={async (values) => {
            const ok = await runCollect({
              items: collectFor.items,
              amount: values.amount,
              currencyId: values.currencyId,
              ratePerUsdSnapshot: values.ratePerUsdSnapshot,
              receivedAt: values.receivedAt,
              notes: values.notes,
              lines: values.lines,
              send: collectFor.send,
            });
            if (ok) {
              setCollectFor(null);
              selection.clear();
            }
          }}
          onDismiss={() => setCollectFor(null)}
        />
      )}

      {billEntry?.charge && (
        <BillSheet
          visible
          charge={billEntry.charge}
          label={monthLabelOf(billEntry)}
          recipient={{ name: customer.name, phone: customer.phoneNumber }}
          onCollect={() => {
            const entry = billEntry;
            setBillEntry(null);
            if (entry) openCollect([entry]);
          }}
          onChanged={() => void fetchBills(customer.id, lines, year)}
          onDismiss={() => setBillEntry(null)}
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
