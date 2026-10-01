import type { CustomerPlan, MonthBill, MonthEntry } from "@shared/core/types";
import { getCurrentYearMonth } from "@shared/core/utils/date";

export type LineIndicator = "paid" | "unpaid";

// A line tab's dot for the viewed year: worst wins, nothing due yet = no dot.
export function lineIndicator(grid: MonthEntry[]): LineIndicator | null {
  let hasPaid = false;
  for (const m of grid) {
    if (m.status === "unpaid") return "unpaid";
    if (m.status === "paid") hasPaid = true;
  }
  return hasPaid ? "paid" : null;
}

export interface YearSummary {
  paid: number;
  unpaid: number;
  skipped: number;
  collectedUsd: number;
}

// Collected is CASH reaching the year's bills, in USD at each bill's own rate.
export function yearSummary(
  grid: MonthEntry[],
  bills: MonthBill[],
  lineId: string | null,
  year: number,
): YearSummary {
  return {
    paid: grid.filter((m) => m.status === "paid").length,
    unpaid: grid.filter((m) => m.status === "unpaid").length,
    skipped: grid.filter((m) => m.status === "skipped").length,
    collectedUsd: bills
      .filter(
        (b) =>
          b.charge.customerPlanId === lineId &&
          (b.charge.billingMonth ?? "").startsWith(String(year)),
      )
      .reduce((sum, b) => sum + b.collected / b.charge.ratePerUsdSnapshot, 0),
  };
}

// The year arrows stop at the line's start year; with no line, the earliest one.
export function minGridYear(
  lines: CustomerPlan[],
  selected: CustomerPlan | null,
): number {
  if (selected) return new Date(selected.startDate).getFullYear();
  return Math.min(
    ...lines.map((l) => new Date(l.startDate).getFullYear()),
    getCurrentYearMonth().year,
  );
}
