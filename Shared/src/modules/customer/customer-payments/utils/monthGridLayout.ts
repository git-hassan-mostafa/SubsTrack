import type { Charge, MonthEntry } from "@shared/core/types";
import { getCurrentYearMonth } from "@shared/core/utils/date";
import { blockStartMonth } from "@shared/modules/customer/customer-payments/utils/monthSelection";

// How a cell meets its neighbours: one multi-month bill reads as one pill.
export interface CellJoin {
  joinStart: boolean;
  joinEnd: boolean;
  wrapFromPrev: boolean;
  wrapToNext: boolean;
}

export type CellBadge =
  | "included"
  | "partial"
  | "paid"
  | "skipped"
  | "written_off"
  | "this_month";

export const CELL_BADGE_KEYS: Record<CellBadge, string> = {
  included: "payments.included_label",
  partial: "payments.partial_badge",
  paid: "common.paid",
  skipped: "payments.skip.skipped_label",
  written_off: "payments.written_off_badge",
  this_month: "payments.this_month",
};

// The line's N-month window; its unpaid months will be paid as ONE bill (#194).
export interface MonthBlock {
  startDate: string;
  durationMonths: number;
}

function isPayableMonth(entry: MonthEntry): boolean {
  return entry.status === "unpaid" || entry.status === "future";
}

function payableBlockStart(entry: MonthEntry, block: MonthBlock | null): string | null {
  if (!block || block.durationMonths <= 1 || !isPayableMonth(entry)) return null;
  return blockStartMonth(entry.billingMonth, block.startDate, block.durationMonths);
}

// The bill id once money reached the month, else its unpaid block — one pill each.
function groupIdOf(entry: MonthEntry, block: MonthBlock | null): string | null {
  if (entry.status === "paid" && entry.charge) return entry.charge.id;
  const blockStart = payableBlockStart(entry, block);
  return blockStart ? `block:${blockStart}` : null;
}

function reachesNextYear(billingMonth: string, durationMonths: number, year: number): boolean {
  const startYear = parseInt(billingMonth.substring(0, 4));
  const startMonth = parseInt(billingMonth.substring(5, 7));
  const endAbsolute = startYear * 12 + startMonth + durationMonths - 1;
  return endAbsolute >= (year + 1) * 12 + 1;
}

function billReachesNextYear(charge: Charge, year: number): boolean {
  return !!charge.billingMonth && reachesNextYear(charge.billingMonth, charge.durationMonths, year);
}

function continuesFromLastYear(entry: MonthEntry, block: MonthBlock | null): boolean {
  if (entry.status === "paid") return entry.isGroupSecondary;
  const blockStart = payableBlockStart(entry, block);
  return blockStart !== null && blockStart < entry.billingMonth;
}

function continuesIntoNextYear(entry: MonthEntry, block: MonthBlock | null): boolean {
  if (entry.status === "paid") return entry.charge !== null && billReachesNextYear(entry.charge, entry.year);
  const blockStart = payableBlockStart(entry, block);
  return blockStart !== null && block !== null && reachesNextYear(blockStart, block.durationMonths, entry.year);
}

export function cellJoins(
  months: MonthEntry[],
  columns: number,
  block: MonthBlock | null = null,
): CellJoin[] {
  const groups = months.map((entry) => groupIdOf(entry, block));
  return months.map((entry, i) => {
    const group = groups[i];
    const prev = i > 0 ? months[i - 1] : null;
    const next = i < months.length - 1 ? months[i + 1] : null;
    const atRowStart = i % columns === 0;
    const atRowEnd = (i + 1) % columns === 0;
    const withPrev = !!group && prev !== null && groups[i - 1] === group;
    const withNext = !!group && next !== null && groups[i + 1] === group;
    const fromLastYear = i === 0 && continuesFromLastYear(entry, block);
    const intoNextYear =
      i === months.length - 1 && continuesIntoNextYear(entry, block);
    return {
      joinStart: withPrev && !atRowStart,
      joinEnd: withNext && !atRowEnd,
      wrapFromPrev: (withPrev && atRowStart) || fromLastYear,
      wrapToNext: (withNext && atRowEnd) || intoNextYear,
    };
  });
}

export function isCurrentMonth(entry: MonthEntry): boolean {
  const { year, month } = getCurrentYearMonth();
  return entry.year === year && entry.month === month;
}

// A write-off outranks the money in every look; part-paid keeps "paid" for rules.
export function isWrittenOffMonth(entry: MonthEntry): boolean {
  return !!entry.charge?.writtenOffAt;
}

// Partial is presentation only — the status stays "paid" (no "partial" status).
export function isPartialMonth(entry: MonthEntry): boolean {
  return entry.status === "paid" && entry.balance > 0;
}

// Only a block's FIRST cell is ringed, or the borders seam the joined pill.
export function showsPartialRing(entry: MonthEntry): boolean {
  return isPartialMonth(entry) && !entry.isGroupSecondary && !isWrittenOffMonth(entry);
}

export function cellBadge(entry: MonthEntry): CellBadge | null {
  if (isWrittenOffMonth(entry)) return "written_off";
  if (entry.status === "paid" && entry.isGroupSecondary) return "included";
  if (isPartialMonth(entry)) return "partial";
  if (entry.status === "paid") return "paid";
  if (entry.status === "skipped") return "skipped";
  if (isCurrentMonth(entry)) return "this_month";
  return null;
}
