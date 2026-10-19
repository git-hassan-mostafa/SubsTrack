import type { Charge, MonthEntry, OpenItem, UsageEntry } from "@shared/core/types";
import { ADMIN_ONLY, withReason, type MenuItem } from "@shared/shared/lib/menuItem";
import {
  blockingPaidMonths,
  blockingUnpaidMonths,
  coveredBillingMonths,
} from "./payOrder";
import { isAfterMonth, type YearMonth } from "./payWindow";
import { isReadingLocked } from "./usageBill";

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

export function hasViewableBill(entry: MonthEntry): boolean {
  return (
    !!entry.charge &&
    (entry.status === "paid" || entry.status === "written_off")
  );
}

// Only a month already due can be given up on; a stopped line owes no later one.
export function canWriteOffMonth(entry: MonthEntry, gates: LineGates): boolean {
  return entry.status === "unpaid" && !isPayBlocked(entry, gates);
}

// A custom-price line qualifies too — it opens the collect form instead.
export function canQuickPayMonth(entry: MonthEntry, gates: LineGates): boolean {
  return (
    !isPayBlocked(entry, gates) &&
    payOrderBlocker(gates, [entry.billingMonth]) === null &&
    isPayableStatus(entry, gates)
  );
}

// The month's OWN price decides, never today's: an unpriced month types it (#112, #185).
export function quickPayItem(item: OpenItem | undefined): OpenItem | null {
  return item && !item.openAmount && item.balance > 0 ? item : null;
}

// The whole BILL is the void, so a multi-month block is judged by every month.
export function billVoidMonths(charge: Charge, fallbackMonth: string): string[] {
  return coveredBillingMonths(
    charge.billingMonth ?? fallbackMonth,
    charge.durationMonths,
  );
}

// A usage month with no reading (or typed units) of its own yet.
export function isUsageMissing(entry: MonthEntry): boolean {
  return entry.usage?.kind === "waiting" && entry.usage.waitingFor === "reading";
}

export function isMonthReadingLocked(
  entry: MonthEntry,
  gates: LineGates,
  usageEntry: UsageEntry,
): boolean {
  return isReadingLocked(usageEntry, entry.billingMonth, gates.paidMonths);
}

export type MonthTap =
  | { kind: "before_start" }
  | { kind: "reading" }
  | { kind: "unskip" }
  | { kind: "bill" }
  | { kind: "pay_limit" }
  | { kind: "pay_order"; month: string }
  | { kind: "collect" };

export function monthTap(entry: MonthEntry, gates: LineGates): MonthTap {
  if (entry.status === "before_start") return { kind: "before_start" };
  if (entry.status === "waiting") return { kind: "reading" };
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
  | "reading"
  | "collect-remaining"
  | "history"
  | "write-off"
  | "revert-write-off"
  | "void-month";

export type MonthMenuItem = MenuItem<MonthMenuKey>;

export interface MonthMenuViewer {
  isAdmin: boolean;
  isFixed: boolean;
  canSend: boolean;
  usageEntry: UsageEntry | null;
}

function readingMenuItem(
  entry: MonthEntry,
  gates: LineGates,
  usageEntry: UsageEntry,
): MonthMenuItem {
  const meter = usageEntry === "reading";
  const missing = isUsageMissing(entry);
  const labelKey = meter
    ? missing ? "payments.reading.enter_reading" : "payments.reading.fix_reading"
    : missing ? "payments.reading.enter_units" : "payments.reading.fix_units";
  return withReason<MonthMenuKey>(
    { key: "reading", group: "manage", labelKey },
    isMonthReadingLocked(entry, gates, usageEntry) &&
      (meter ? "why_disabled.reading_locked" : "why_disabled.usage_locked"),
  );
}

// Why Pay now is greyed on a month that still owes; null when it can run.
function monthPayBlockKey(entry: MonthEntry, gates: LineGates): string | null {
  if (entry.status === "skipped" && !isLockedSkipped(entry, gates)) {
    return "why_disabled.month_skipped";
  }
  if (!isPayableStatus(entry, gates)) return null;
  if (isPayBlocked(entry, gates)) return "why_disabled.line_stopped";
  return payOrderBlocker(gates, [entry.billingMonth]) ? "why_disabled.pay_older_first" : null;
}

export function monthMenuItems(
  entry: MonthEntry,
  gates: LineGates,
  viewer: MonthMenuViewer,
): MonthMenuItem[] {
  const items: MonthMenuItem[] = [
    { key: "open", group: "open", labelKey: "common.open" },
  ];
  const payBlock = monthPayBlockKey(entry, gates);
  if (payBlock) {
    items.push(
      withReason<MonthMenuKey>(
        { key: "quick-pay", group: "money", labelKey: "payments.quick_pay.pay_now" },
        payBlock,
      ),
    );
  } else if (canQuickPayMonth(entry, gates)) {
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
  if (entry.usage && viewer.usageEntry) {
    items.push(readingMenuItem(entry, gates, viewer.usageEntry));
  }
  if (entry.status === "unpaid" || entry.status === "future") {
    items.push({
      key: "skip",
      group: "manage",
      labelKey: "payments.skip.skip_action",
    });
  }
  if (entry.status === "skipped") {
    items.push(
      withReason<MonthMenuKey>(
        { key: "unskip", group: "manage", labelKey: "payments.skip.unskip_action" },
        isLockedSkipped(entry, gates) && "why_disabled.later_month_paid",
      ),
    );
  }
  if (hasViewableBill(entry)) {
    items.push({ key: "bill", group: "open", labelKey: "ledger.view_bill" });
    if (entry.charge?.writtenOffAt) {
      items.push({
        key: "revert-write-off",
        group: "manage",
        labelKey: "ledger.revert_write_off",
        captionKey: "ledger.revert_write_off_caption",
      });
    }
    if (entry.balance > 0) {
      items.push(
        withReason<MonthMenuKey>(
          { key: "collect-remaining", group: "money", labelKey: "ledger.collect_rest" },
          entry.charge?.writtenOffAt != null && "why_disabled.written_off",
        ),
      );
    }
  }
  if (entry.status !== "before_start") {
    items.push(
      withReason<MonthMenuKey>(
        { key: "history", group: "history", labelKey: "audit.history" },
        !viewer.isAdmin && ADMIN_ONLY,
      ),
    );
  }
  if (entry.status === "unpaid") {
    items.push(
      withReason<MonthMenuKey>(
        {
          key: "write-off",
          group: "danger",
          labelKey: "ledger.write_off",
          captionKey: "ledger.write_off_month_caption",
          destructive: true,
        },
        !canWriteOffMonth(entry, gates) && "why_disabled.line_stopped",
      ),
    );
  }
  if (entry.charge && !entry.charge.writtenOffAt) {
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
  writeOffable: MonthEntry[];
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
    writeOffable: entries.filter((e) => canWriteOffMonth(e, gates)),
  };
}

export type MonthSelectionKey =
  | "pay"
  | "pay-whatsapp"
  | "skip"
  | "unskip"
  | "write-off";

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
  if (groups.writeOffable.length > 0) {
    items.push({
      key: "write-off",
      group: "danger",
      labelKey: "ledger.write_off",
      destructive: true,
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
