import type { Charge, MonthEntry } from "@shared/core/types";
import type { MenuItem } from "@shared/shared/lib/menuItem";
import {
  blockingPaidMonths,
  blockingUnpaidMonths,
  coveredBillingMonths,
} from "./payOrder";
import { isAfterMonth, type YearMonth } from "./payWindow";

// One line's pay and void gates; all-time, so the viewed year never unlocks one.
export interface LineGates {
  payLimit: YearMonth | null;
  uncoveredMonths: string[];
  paidMonths: string[];
}

// Months settle OLDEST first; months inside the same write never block it.
export function payOrderBlocker(
  gates: LineGates,
  months: string[],
): string | null {
  return blockingUnpaidMonths(gates.uncoveredMonths, months)[0] ?? null;
}

// Voids (and unskips) run NEWEST first — the mirror of payOrderBlocker.
export function voidOrderBlocker(
  gates: LineGates,
  months: string[],
): string | null {
  return blockingPaidMonths(gates.paidMonths, months)[0] ?? null;
}

// A stopped customer or line bills up to the month it stopped in.
export function isPayBlocked(entry: MonthEntry, gates: LineGates): boolean {
  return gates.payLimit !== null && isAfterMonth(entry, gates.payLimit);
}

// A skip that can no longer be unskipped is settled by collecting it (#84).
export function isLockedSkipped(entry: MonthEntry, gates: LineGates): boolean {
  return (
    entry.status === "skipped" &&
    voidOrderBlocker(gates, [entry.billingMonth]) !== null
  );
}

export function isPayableStatus(entry: MonthEntry, gates: LineGates): boolean {
  return (
    entry.status === "unpaid" ||
    entry.status === "future" ||
    isLockedSkipped(entry, gates)
  );
}

// A written-off month reads "unpaid" by the money rule, yet HAS a bill (#152).
export function hasViewableBill(entry: MonthEntry): boolean {
  return (
    !!entry.charge &&
    (entry.status === "paid" || entry.charge.writtenOffAt !== null)
  );
}

// A custom-price line qualifies too — it opens the collect form instead.
export function canQuickPayMonth(entry: MonthEntry, gates: LineGates): boolean {
  return (
    !isPayBlocked(entry, gates) &&
    payOrderBlocker(gates, [entry.billingMonth]) === null &&
    isPayableStatus(entry, gates)
  );
}

// The whole BILL is the void, so a multi-month block is judged by every month.
export function billVoidMonths(charge: Charge, fallbackMonth: string): string[] {
  return coveredBillingMonths(
    charge.billingMonth ?? fallbackMonth,
    charge.durationMonths,
  );
}

export type MonthTap =
  | { kind: "before_start" }
  | { kind: "unskip" }
  | { kind: "bill" }
  | { kind: "pay_limit" }
  | { kind: "pay_order"; month: string }
  | { kind: "collect" };

export function monthTap(entry: MonthEntry, gates: LineGates): MonthTap {
  if (entry.status === "before_start") return { kind: "before_start" };
  if (entry.status === "skipped" && !isLockedSkipped(entry, gates)) {
    return { kind: "unskip" };
  }
  if (hasViewableBill(entry)) return { kind: "bill" };
  if (isPayBlocked(entry, gates)) return { kind: "pay_limit" };
  const blocker = payOrderBlocker(gates, [entry.billingMonth]);
  if (blocker) return { kind: "pay_order", month: blocker };
  return { kind: "collect" };
}

export type MonthMenuKey =
  | "open"
  | "quick-pay"
  | "quick-pay-whatsapp"
  | "collect-part"
  | "skip"
  | "unskip"
  | "bill"
  | "collect-remaining"
  | "history"
  | "void-month";

export type MonthMenuItem = MenuItem<MonthMenuKey>;

export interface MonthMenuViewer {
  isAdmin: boolean;
  isFixed: boolean;
  canSend: boolean;
}

export function monthMenuItems(
  entry: MonthEntry,
  gates: LineGates,
  viewer: MonthMenuViewer,
): MonthMenuItem[] {
  const items: MonthMenuItem[] = [
    { key: "open", group: "open", labelKey: "common.open" },
  ];
  if (canQuickPayMonth(entry, gates)) {
    items.push({
      key: "quick-pay",
      group: "money",
      labelKey: "payments.quick_pay.pay_now",
      captionKey: viewer.isFixed ? undefined : "payments.quick_pay.type_amount",
    });
    items.push({
      key: "quick-pay-whatsapp",
      group: "money",
      labelKey: "invoice.pay_and_send_whatsapp",
      captionKey: viewer.canSend ? undefined : "invoice.no_phone",
      disabled: !viewer.canSend,
    });
    if (viewer.isFixed) {
      items.push({
        key: "collect-part",
        group: "money",
        labelKey: "ledger.collect_part",
      });
    }
  }
  if (entry.status === "unpaid" || entry.status === "future") {
    items.push({
      key: "skip",
      group: "manage",
      labelKey: "payments.skip.skip_action",
    });
  }
  if (entry.status === "skipped" && !isLockedSkipped(entry, gates)) {
    items.push({
      key: "unskip",
      group: "manage",
      labelKey: "payments.skip.unskip_action",
    });
  }
  if (hasViewableBill(entry)) {
    items.push({ key: "bill", group: "open", labelKey: "ledger.view_bill" });
    if (entry.balance > 0 && entry.charge?.writtenOffAt == null) {
      items.push({
        key: "collect-remaining",
        group: "money",
        labelKey: "ledger.collect_rest",
      });
    }
  }
  if (viewer.isAdmin && entry.status !== "before_start") {
    items.push({ key: "history", group: "history", labelKey: "audit.history" });
  }
  if (entry.charge) {
    items.push({
      key: "void-month",
      group: "danger",
      labelKey: "ledger.void_month",
      destructive: true,
    });
  }
  return items;
}

export interface MonthSelectionGroups {
  payable: MonthEntry[];
  skippable: MonthEntry[];
  skipped: MonthEntry[];
}

// A part-paid month is payable too: its rest is collected with the others.
export function monthSelectionGroups(
  entries: MonthEntry[],
  gates: LineGates,
): MonthSelectionGroups {
  return {
    payable: entries.filter(
      (e) =>
        !isPayBlocked(e, gates) &&
        (isPayableStatus(e, gates) || (e.status === "paid" && e.balance > 0)),
    ),
    skippable: entries.filter(
      (e) => e.status === "unpaid" || e.status === "future",
    ),
    skipped: entries.filter(
      (e) => e.status === "skipped" && !isLockedSkipped(e, gates),
    ),
  };
}

export type MonthSelectionKey = "pay" | "pay-whatsapp" | "skip" | "unskip";

export type MonthSelectionItem = MenuItem<MonthSelectionKey>;

export function monthSelectionItems(
  groups: MonthSelectionGroups,
  canSend: boolean,
): MonthSelectionItem[] {
  const items: MonthSelectionItem[] = [];
  if (groups.payable.length > 0) {
    items.push({ key: "pay", group: "money", labelKey: "payments.collect" });
    if (canSend) {
      items.push({
        key: "pay-whatsapp",
        group: "money",
        labelKey: "invoice.pay_and_send_whatsapp",
      });
    }
  }
  if (groups.skippable.length > 0) {
    items.push({
      key: "skip",
      group: "manage",
      labelKey: "payments.skip.skip_action",
    });
  }
  if (groups.skipped.length > 0) {
    items.push({
      key: "unskip",
      group: "manage",
      labelKey: "payments.skip.unskip_action",
    });
  }
  return items;
}

export type QuickPayLinkAction =
  | { kind: "skipped" }
  | { kind: "pay_order"; month: string }
  | { kind: "collect" };

// The `?quickPay=1` door: this month, unless a skip or an older month stops it.
export function quickPayLinkAction(
  entry: MonthEntry,
  gates: LineGates,
): QuickPayLinkAction {
  if (entry.status === "skipped" && !isLockedSkipped(entry, gates)) {
    return { kind: "skipped" };
  }
  const blocker = payOrderBlocker(gates, [entry.billingMonth]);
  if (blocker) return { kind: "pay_order", month: blocker };
  return { kind: "collect" };
}
