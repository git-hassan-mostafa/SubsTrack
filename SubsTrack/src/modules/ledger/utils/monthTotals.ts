import { localMonthKey } from '@/src/core/utils/date';

/**
 * "YYYY-MM" → USD, over rows that each froze their own rate.
 *
 * Shared by both collection repositories so the web and offline history show
 * the same section headers — the conversion must use the row's snapshot, never
 * today's rate, or last year's totals would move every time a rate is edited.
 */
export function sumByMonth(
  rows: { received_at: string; amount: number; rate_per_usd_snapshot: number }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    // LOCAL month, matching how groupByMonth buckets the rows — a UTC slice
    // would file an early-morning hand-over under the previous month and the
    // header would stop agreeing with the rows under it.
    const month = localMonthKey(row.received_at);
    const rate = Number(row.rate_per_usd_snapshot) || 1;
    totals[month] = (totals[month] ?? 0) + Number(row.amount) / rate;
  }
  return totals;
}
