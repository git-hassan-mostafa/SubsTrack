import type { UnpaidStartRule } from "@/src/core/types";
import { getCurrentYearMonth } from "@/src/core/utils/date";

export function isBeforeStartDate(
  year: number,
  month: number,
  startDate: string,
): boolean {
  const [sy, sm] = startDate.split("-").map(Number);
  return year < sy || (year === sy && month < sm);
}

/** Today's day-of-month (1–31). Split out so the unpaid-rule logic is testable. */
export function getCurrentDayOfMonth(): number {
  return new Date().getDate();
}

/** Day-of-month of a YYYY-MM-DD start date; 1 when the day part is missing. */
export function startDayOfMonth(startDate: string): number {
  const day = Number(startDate.split("-")[2]);
  return Number.isFinite(day) && day >= 1 ? day : 1;
}

/**
 * Under the 'customer_start_day' unpaid rule, has the CURRENT month reached the
 * line's billing day yet? A start day past the end of a short month (e.g. the
 * 31st in February) clamps to that month's last day, so the month still becomes
 * due rather than being skipped entirely.
 */
export function hasReachedStartDay(
  year: number,
  month: number,
  startDate: string,
): boolean {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dueDay = Math.min(startDayOfMonth(startDate), daysInMonth);
  return getCurrentDayOfMonth() >= dueDay;
}

/**
 * Does an unpaid (year, month) count as "not owed yet" — i.e. does the grid paint
 * it grey instead of red? Only ever true for the CURRENT month under the
 * 'customer_start_day' rule; every past month is unpaid on sight. The sibling
 * `isNotLateYet` answers the different question of when the customer starts
 * reading as **overdue**. Shared by the grid and the customer-list aggregator so
 * the two stay in lockstep.
 */
export function isNotDueYet(
  rule: UnpaidStartRule,
  year: number,
  month: number,
  startDate: string,
): boolean {
  if (rule !== "customer_start_day") return false;
  const { year: cy, month: cm } = getCurrentYearMonth();
  if (year !== cy || month !== cm) return false;
  return !hasReachedStartDay(year, month, startDate);
}

/**
 * Is an UNPAID month not LATE yet? Under 'customer_start_day' that is true for
 * LAST month until this month's billing day arrives: the collector hasn't come
 * this cycle, so the customer is not behind yet. The month still shows **red**
 * and still blocks a later payment (oldest-first) — only the "Overdue" flag
 * waits. Anything older than last month is late on sight. See gotchas #83.
 */
export function isNotLateYet(
  rule: UnpaidStartRule,
  year: number,
  month: number,
  startDate: string,
): boolean {
  if (rule !== "customer_start_day") return false;
  const { year: cy, month: cm } = getCurrentYearMonth();
  if ((cy - year) * 12 + (cm - month) !== 1) return false;
  return !hasReachedStartDay(cy, cm, startDate);
}
