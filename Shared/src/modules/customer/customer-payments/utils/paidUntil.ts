import type { PrepaidExpiry } from "@shared/core/types";
import { currentDate, daysBetween } from "@shared/core/utils/date";
import { toDay } from "@shared/core/utils/dateRange";

export const EXPIRING_SOON_DAYS = 3;

// Last day of the newest month money reached (paidMonths sorted); never saved.
export function paidUntil(paidMonths: readonly string[]): string | null {
  const newest = paidMonths[paidMonths.length - 1];
  if (!newest) return null;
  const [year, month] = newest.split("-").map(Number);
  return toDay(new Date(year, month, 0));
}

// The paid-until day itself is still served; a line not started yet has none.
export function prepaidExpiry(
  until: string | null,
  startDate: string,
): PrepaidExpiry | null {
  const today = toDay(currentDate());
  if (until === null) {
    const sinceStart = daysBetween(startDate.slice(0, 10), today);
    return sinceStart < 0
      ? null
      : { state: "expired", paidUntil: null, days: sinceStart };
  }
  const left = daysBetween(today, until);
  if (left < 0) return { state: "expired", paidUntil: until, days: -left - 1 };
  return {
    state: left <= EXPIRING_SOON_DAYS ? "expiring" : "paid_until",
    paidUntil: until,
    days: left,
  };
}

// The line that runs out first; never paid runs out before any paid one.
export function soonerExpiry<T extends PrepaidExpiry>(a: T | null, b: T): T {
  return a !== null && (a.paidUntil ?? "") <= (b.paidUntil ?? "") ? a : b;
}
