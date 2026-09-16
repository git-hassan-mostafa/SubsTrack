import { currentMonthDays } from '@/src/core/utils/dateRange';

/**
 * Has the screen already scrolled back past this month?
 *
 * Once a loaded entry is older than the 1st, the list is already showing more
 * than the current month — so there is nothing left to offer and the export
 * just takes what is on screen. `occurredAt` is an ISO timestamp and the month
 * start is `YYYY-MM-DD`, so comparing the date part is enough.
 */
export function showsOlderThanThisMonth(
  entries: readonly { occurredAt: string }[],
  monthStart = currentMonthDays().fromDate,
): boolean {
  return entries.some((e) => e.occurredAt.slice(0, 10) < monthStart);
}
