import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AuditRecordTarget,
  Charge,
  Collection,
  Customer,
  MonthEntry,
  OpenItem,
} from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { toBillingMonth } from "@shared/core/utils/date";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useLineGrid } from "@shared/modules/customer/customer-payments/hooks/useLineGrid";
import { getBlockRangeLabel } from "@shared/modules/customer/customer-payments/utils/blockRangeLabel";
import {
  billVoidMonths,
  monthMenuItems,
  monthSelectionGroups,
  monthSelectionItems,
  monthTap,
  payOrderBlocker,
  quickPayLinkAction,
  voidOrderBlocker,
  type MonthMenuKey,
  type MonthSelectionKey,
} from "@shared/modules/customer/customer-payments/utils/monthActions";
import { isCurrentMonth } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import {
  applySelectionChange,
  expandSelectionUnit,
  groupPayableBlocks,
} from "@shared/modules/customer/customer-payments/utils/monthSelection";
import type { SkipMode } from "@shared/modules/customer/customer-payments/utils/skipText";
import { quickPayInputs } from "@shared/modules/customer/customers/utils/quickPay";
import {
  useWriteOffActions,
  writeOffTargetOf,
} from "@shared/modules/ledger/hooks/useWriteOffActions";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { earlierPriceNotes } from "@shared/modules/ledger/utils/earlierPriceNotes";
import { monthItemFromEntry } from "@shared/modules/ledger/utils/openItems";
import { isEarlierPrice } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import { groupBy } from "@shared/core/utils/groupBy";
import { useSelection } from "@shared/shared/hooks/useSelection";
import { confirm } from "@shared/shared/lib/confirm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { usePaymentSlice } from "@shared/state/hooks/usePaymentSlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";

// The `?quickPay=1` door; `schedule` lets the phone wait for its screen push.
export interface QuickPayLink {
  requested: boolean;
  consume: () => void;
  schedule?: (run: () => void) => () => void;
}

export interface MonthGridOptions {
  customer: Customer;
  refreshToken?: number;
  canSend: boolean;
  openCollect: (items: OpenItem[], single: boolean) => void;
  sendReceipt: (collection: Collection) => Promise<unknown>;
  quickPayLink?: QuickPayLink;
}

export interface MonthHistoryRequest {
  chargeId: string | null;
  targets: AuditRecordTarget[];
  subtitle: string;
}

export interface SkipRequest {
  entries: MonthEntry[];
  mode: SkipMode;
}

// Both apps' month grid: every tap, menu row and selection action decides here.
export function useCustomerMonthGrid({
  customer,
  refreshToken = 0,
  canSend,
  openCollect,
  sendReceipt,
  quickPayLink,
}: MonthGridOptions) {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const line = useLineGrid(customer, refreshToken);
  const { grid, gates, linePrice, lines, priceAt, selectedLine, year } = line;
  const writeOffActions = useWriteOffActions();
  const fetchBills = usePaymentSlice((s) => s.fetchBills);
  const voidMonthBill = usePaymentSlice((s) => s.voidMonthBill);
  const paymentsError = usePaymentSlice((s) => s.error);
  const clearPaymentError = usePaymentSlice((s) => s.clearError);
  const collect = useLedgerSlice((s) => s.collect);
  const collecting = useLedgerSlice((s) => s.loadingCollect);
  const ledgerError = useLedgerSlice((s) => s.error);
  const clearLedgerError = useLedgerSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrency = useDisplayCurrency();

  const [busyMonth, setBusyMonth] = useState<string | null>(null);
  const [billEntry, setBillEntry] = useState<MonthEntry | null>(null);
  const [voidEntry, setVoidEntry] = useState<MonthEntry | null>(null);
  const [history, setHistory] = useState<MonthHistoryRequest | null>(null);
  const [skipRequest, setSkipRequest] = useState<SkipRequest | null>(null);
  const sendAfterCollect = useRef(false);
  const quickPayHandled = useRef(false);
  const cancelQuickPay = useRef<(() => void) | null>(null);

  const selection = useSelection();
  const clearSelection = selection.clear;
  useEffect(() => {
    clearSelection();
  }, [year, selectedLine?.id, clearSelection]);

  const notAvailable = useCallback(
    (message: string) =>
      void confirm({
        title: t("common.not_available"),
        message,
        confirmLabel: t("common.close"),
        hideCancel: true,
      }),
    [t],
  );

  const showPayOrderBlocked = (month: string) =>
    notAvailable(
      t("payments.earlier_month_unpaid", { month: billingMonthLabel(month) }),
    );

  const showVoidOrderBlocked = (month: string) =>
    notAvailable(
      t("payments.later_month_paid", { month: billingMonthLabel(month) }),
    );

  const monthLabelOf = (entry: MonthEntry): string => {
    const span = entry.charge?.durationMonths ?? linePrice.durationMonths;
    const base =
      span > 1
        ? getBlockRangeLabel(entry.billingMonth, span, t)
        : `${t(`months.${entry.label}`)} ${entry.year}`;
    const planName = selectedLine?.plan?.name;
    return planName ? `${base} · ${planName}` : base;
  };

  const itemFor = (entry: MonthEntry): OpenItem | null => {
    if (!selectedLine) return null;
    const price = priceAt(entry.billingMonth);
    return monthItemFromEntry({
      entry,
      customerId: customer.id,
      customerName: customer.name,
      branchId: customer.branchId,
      customerPlanId: selectedLine.id,
      planId: selectedLine.planId,
      label: monthLabelOf(entry),
      price: {
        amount: price.amount,
        currencyId: price.currencyId,
        durationMonths: price.durationMonths,
      },
      ratePerUsd: findCurrency(currencies, price.currencyId)?.ratePerUsd ?? 1,
      earlierPrice: isEarlierPrice(price, linePrice),
    });
  };

  const itemsFor = (entries: MonthEntry[]): OpenItem[] => {
    if (!selectedLine) return [];
    const cells =
      linePrice.durationMonths > 1
        ? groupPayableBlocks(entries, selectedLine).map((block) => {
            const cell =
              entries.find((e) => e.billingMonth === block.startBillingMonth) ??
              entries.find((e) => e.billingMonth >= block.startBillingMonth);
            return cell
              ? { ...cell, billingMonth: block.startBillingMonth }
              : null;
          })
        : entries;
    const items = cells
      .map((cell) => (cell ? itemFor(cell) : null))
      .filter((item): item is OpenItem => item !== null);
    return [...groupBy(items, keyOf).values()].map(([first]) => first);
  };

  const openCollectFor = (entries: MonthEntry[], send = false) => {
    const items = itemsFor(entries);
    if (items.length === 0) return;
    if (items.length > 1 && items.some((i) => i.openAmount)) {
      notAvailable(t("ledger.open_amount_one_at_a_time"));
      return;
    }
    sendAfterCollect.current = send;
    openCollect(items, items.length === 1);
  };

  const collected = async (collections: Collection[]) => {
    clearSelection();
    if (!sendAfterCollect.current) return;
    for (const collection of collections) await sendReceipt(collection);
  };

  const payLimitLabel = gates.payLimit
    ? billingMonthLabel(
        toBillingMonth(gates.payLimit.year, gates.payLimit.month),
      )
    : null;

  const tap = (entry: MonthEntry) => {
    const action = monthTap(entry, gates);
    switch (action.kind) {
      case "before_start":
        notAvailable(t("payments.before_start_date"));
        return;
      case "unskip":
        setSkipRequest({ entries: [entry], mode: "unskip" });
        return;
      case "bill":
        setBillEntry(entry);
        return;
      case "pay_limit":
        notAvailable(
          t(
            customer.active
              ? "payments.cancelled_plan_month_blocked"
              : "payments.inactive_month_blocked",
            { month: payLimitLabel },
          ),
        );
        return;
      case "pay_order":
        showPayOrderBlocked(action.month);
        return;
      case "collect":
        openCollectFor([entry]);
    }
  };

  const quickPay = async (entry: MonthEntry, send = false) => {
    const blocker = payOrderBlocker(gates, [entry.billingMonth]);
    if (blocker) {
      showPayOrderBlocked(blocker);
      return;
    }
    const item = linePrice.isFixed ? itemsFor([entry])[0] : undefined;
    if (!item || !user) {
      openCollectFor([entry], send);
      return;
    }
    const author = { tenantId: user.tenantId, receivedByUserId: user.id };
    const pay = async () => {
      setBusyMonth(entry.billingMonth);
      const [input] = quickPayInputs([item], author, new Date().toISOString());
      const created = await collect(input).finally(() => setBusyMonth(null));
      if (created && send) await sendReceipt(created);
    };
    const priceNote = earlierPriceNotes([item], currencies)[0] ?? null;
    if (linePrice.durationMonths <= 1) {
      if (!priceNote) {
        await pay();
        return;
      }
      await confirm({
        title: t("ledger.earlier_price_title"),
        message: priceNote,
        confirmLabel: t("payments.quick_pay.confirm"),
        onConfirm: pay,
      });
      return;
    }
    const blockMessage = t("payments.quick_pay.confirm_multi_month_message", {
      amount: formatMoney(
        item.balance,
        findCurrency(currencies, item.currencyId),
        displayCurrency,
      ),
      months: getBlockRangeLabel(item.billingMonth!, item.durationMonths, t),
    });
    await confirm({
      title: t("payments.quick_pay.confirm_multi_month_title"),
      message: priceNote ? `${blockMessage}\n\n${priceNote}` : blockMessage,
      confirmLabel: t("payments.quick_pay.confirm"),
      onConfirm: pay,
    });
  };

  const voidBill = (entry: MonthEntry): boolean => {
    const charge = entry.charge;
    if (!user || !charge) return false;
    const blocker = voidOrderBlocker(
      gates,
      billVoidMonths(charge, entry.billingMonth),
    );
    if (blocker) {
      showVoidOrderBlocked(blocker);
      return false;
    }
    setVoidEntry(entry);
    return true;
  };

  const confirmVoid = async (reason: string) => {
    const charge = voidEntry?.charge;
    if (!user || !voidEntry || !charge) return;
    setBusyMonth(voidEntry.billingMonth);
    const result = await voidMonthBill(charge.id, user.id, reason || null)
      .finally(() => setBusyMonth(null));
    if (result.blockedBy) {
      setVoidEntry(null);
      showVoidOrderBlocked(result.blockedBy);
      return;
    }
    if (!result.ok) return;
    await fetchBills(customer.id, lines);
    setVoidEntry(null);
  };

  const writeOff = (charge: Charge, balance: number) =>
    writeOffActions.writeOff(writeOffTargetOf(charge, balance, customer.name));

  const revertWriteOff = (charge: Charge, balance: number) =>
    writeOffActions.revert(writeOffTargetOf(charge, balance, customer.name));

  // A VOIDED month loses its charge from the read, so the id is re-hashed.
  const openHistory = async (entry: MonthEntry) => {
    const chargeId =
      entry.charge?.id ??
      (selectedLine
        ? await chargeService.monthChargeId(selectedLine.id, entry.billingMonth)
        : null);
    setHistory({
      chargeId,
      targets: entry.skip
        ? [{ table: "skipped_months", recordId: entry.skip.id }]
        : [],
      subtitle: monthLabelOf(entry),
    });
  };

  const menuItems = (entry: MonthEntry) =>
    monthMenuItems(entry, gates, {
      isAdmin,
      isFixed: linePrice.isFixed,
      canSend,
    });

  const runMenu = (key: MonthMenuKey, entry: MonthEntry) => {
    switch (key) {
      case "open":
        tap(entry);
        return;
      case "quick-pay":
        void quickPay(entry);
        return;
      case "quick-pay-whatsapp":
        void quickPay(entry, true);
        return;
      case "collect-part":
      case "collect-remaining":
        openCollectFor([entry]);
        return;
      case "skip":
      case "unskip":
        setSkipRequest({ entries: [entry], mode: key });
        return;
      case "bill":
        setBillEntry(entry);
        return;
      case "history":
        void openHistory(entry);
        return;
      case "void-month":
        voidBill(entry);
    }
  };

  const selectedEntries = grid.filter((m) =>
    selection.selectedIds.has(m.billingMonth),
  );
  const groups = monthSelectionGroups(selectedEntries, gates);

  const payGroup = (send: boolean) => {
    if (collecting || groups.payable.length === 0) return;
    const blocker = payOrderBlocker(
      gates,
      groups.payable.map((e) => e.billingMonth),
    );
    if (blocker) showPayOrderBlocked(blocker);
    else openCollectFor(groups.payable, send);
  };

  const runSelection = (key: MonthSelectionKey) => {
    switch (key) {
      case "pay":
        payGroup(false);
        return;
      case "pay-whatsapp":
        payGroup(true);
        return;
      case "skip":
        setSkipRequest({ entries: groups.skippable, mode: "skip" });
        return;
      case "unskip":
        setSkipRequest({ entries: groups.skipped, mode: "unskip" });
    }
  };

  const unitOf = (entry: MonthEntry) =>
    selectedLine ? expandSelectionUnit(entry, grid, selectedLine) : [];

  const replaceSelection = (next: ReadonlySet<string>) => {
    const ids = applySelectionChange(selection.selectedIds, next, (month) => {
      const entry = grid.find((m) => m.billingMonth === month);
      return entry ? unitOf(entry) : [];
    });
    if (ids.length === 0) clearSelection();
    else selection.enterWith(ids);
  };

  const linkRequested = quickPayLink?.requested ?? false;
  const consumeLink = quickPayLink?.consume;
  const scheduleLink = quickPayLink?.schedule;
  const currentEntry = grid.find(isCurrentMonth) ?? null;

  useEffect(() => {
    if (!linkRequested) quickPayHandled.current = false;
  }, [linkRequested]);

  useEffect(() => {
    if (!linkRequested || quickPayHandled.current) return;
    if (line.loading || !line.billsReady || !currentEntry) return;
    quickPayHandled.current = true;
    consumeLink?.();
    const action = quickPayLinkAction(currentEntry, gates);
    if (action.kind === "skipped") {
      notAvailable(t("payments.skip.pay_blocked"));
      return;
    }
    if (action.kind === "pay_order") {
      showPayOrderBlocked(action.month);
      return;
    }
    const run = () => openCollectFor([currentEntry]);
    if (scheduleLink) cancelQuickPay.current = scheduleLink(run);
    else run();
  });

  useEffect(() => () => cancelQuickPay.current?.(), []);

  return {
    ...line,
    isRegular: customer.isRegular,
    busyMonth,
    paymentsError,
    ledgerError,
    clearErrors: () => {
      clearPaymentError();
      clearLedgerError();
    },
    monthLabelOf,
    tap,
    quickPay,
    menuItems,
    runMenu,
    collected,
    unpaidBanner:
      customer.isRegular &&
      selectedLine?.active &&
      currentEntry?.status === "unpaid"
        ? currentEntry
        : null,
    selection: {
      active: selection.active,
      count: selection.count,
      isSelected: selection.isSelected,
      selectedIds: selection.selectedIds,
      replace: replaceSelection,
      toggle: (entry: MonthEntry) => selection.toggleMany(unitOf(entry)),
      start: (entry: MonthEntry) => {
        const unit = unitOf(entry);
        if (unit.length > 0) selection.enterWith(unit);
      },
      clear: clearSelection,
      items: monthSelectionItems(groups, canSend),
      busy: collecting,
      run: runSelection,
    },
    bill: billEntry,
    closeBill: () => setBillEntry(null),
    collectFromBill: () => {
      const entry = billEntry;
      setBillEntry(null);
      if (entry) openCollectFor([entry]);
    },
    voidFromBill: () => (billEntry ? voidBill(billEntry) : false),
    writeOffFromBill: (charge: Charge, balance: number) => {
      setBillEntry(null);
      void writeOff(charge, balance);
    },
    revertWriteOff,
    voidRequest: voidEntry,
    closeVoid: () => setVoidEntry(null),
    confirmVoid,
    history,
    closeHistory: () => setHistory(null),
    skipRequest,
    closeSkip: () => setSkipRequest(null),
    skipDone: () => {
      setSkipRequest(null);
      clearSelection();
    },
  };
}

export type CustomerMonthGrid = ReturnType<typeof useCustomerMonthGrid>;
