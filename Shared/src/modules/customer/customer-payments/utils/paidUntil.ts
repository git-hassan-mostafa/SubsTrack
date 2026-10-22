import { toDay } from "@shared/core/utils/dateRange";

// Last day of the newest month money reached (paidMonths sorted); never saved.
export function paidUntil(paidMonths: readonly string[]): string | null {
  const newest = paidMonths[paidMonths.length - 1];
  if (!newest) return null;
  const [year, month] = newest.split("-").map(Number);
  return toDay(new Date(year, month, 0));
}
