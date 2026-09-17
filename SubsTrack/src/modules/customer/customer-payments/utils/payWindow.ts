import type { Customer, CustomerPlan } from "@/src/core/types";
import { getCurrentYearMonth } from "@/src/core/utils/date";

export type YearMonth = { year: number; month: number };

function monthOf(iso: string | null): YearMonth | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return { year: at.getFullYear(), month: at.getMonth() + 1 };
}

export function isAfterMonth(entry: YearMonth, limit: YearMonth): boolean {
  return (
    entry.year > limit.year ||
    (entry.year === limit.year && entry.month > limit.month)
  );
}

// A stopped line bills up to the month it was CANCELLED in, not up to today.
export function lastBillableMonth(
  customer: Customer,
  line: CustomerPlan | null,
): YearMonth {
  const stops = [
    customer.active ? null : monthOf(customer.cancelledAt),
    !line || line.active ? null : monthOf(line.cancelledAt),
  ];
  let limit = getCurrentYearMonth();
  for (const stop of stops) {
    if (stop && isAfterMonth(limit, stop)) limit = stop;
  }
  return limit;
}
