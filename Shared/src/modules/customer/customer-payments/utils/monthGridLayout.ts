import type { Charge, MonthEntry } from "@shared/core/types";
import { getCurrentYearMonth } from "@shared/core/utils/date";

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

// The BILL id when money reached the month — what tells one block's cells apart.
function groupIdOf(entry: MonthEntry): string | null {
  return entry.status === "paid" && entry.charge ? entry.charge.id : null;
}

function reachesNextYear(charge: Charge, year: number): boolean {
  if (!charge.billingMonth) return false;
  const startYear = parseInt(charge.billingMonth.substring(0, 4));
  const startMonth = parseInt(charge.billingMonth.substring(5, 7));
  const endAbsolute = startYear * 12 + startMonth + charge.durationMonths - 1;
  return endAbsolute >= (year + 1) * 12 + 1;
}

export function cellJoins(months: MonthEntry[], columns: number): CellJoin[] {
  return months.map((entry, i) => {
    const group = groupIdOf(entry);
    const prev = i > 0 ? months[i - 1] : null;
    const next = i < months.length - 1 ? months[i + 1] : null;
    const atRowStart = i % columns === 0;
    const atRowEnd = (i + 1) % columns === 0;
    const withPrev = !!group && prev !== null && groupIdOf(prev) === group;
    const withNext = !!group && next !== null && groupIdOf(next) === group;
    const fromLastYear =
      i === 0 && entry.status === "paid" && entry.isGroupSecondary;
    const intoNextYear =
      i === months.length - 1 &&
      entry.status === "paid" &&
      entry.charge !== null &&
      reachesNextYear(entry.charge, entry.year);
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

// Partial is presentation only — the status stays "paid" (no "partial" status).
export function isPartialMonth(entry: MonthEntry): boolean {
  return entry.status === "paid" && entry.balance > 0;
}

// Only a block's FIRST cell is ringed, or the borders seam the joined pill.
export function showsPartialRing(entry: MonthEntry): boolean {
  return isPartialMonth(entry) && !entry.isGroupSecondary;
}

export function cellBadge(entry: MonthEntry): CellBadge | null {
  if (entry.status === "paid" && entry.isGroupSecondary) return "included";
  if (isPartialMonth(entry)) return "partial";
  if (entry.status === "paid") return "paid";
  if (entry.status === "skipped") return "skipped";
  if (entry.status === "written_off") return "written_off";
  if (isCurrentMonth(entry)) return "this_month";
  return null;
}
