import { localMonthKey } from "@shared/core/utils/date";

/**
 * "YYYY-MM" → USD, over rows that each froze their own rate.
 *
 * Shared by both collection repositories so the web and offline history show
 * the same section headers — the conversion must use the row's snapshot, never
 * today's rate, or last year's totals would move every time a rate is edited.
 */
export function sumByMonth(
  rows: {
    received_at: string;
    amount: number;
    rate_per_usd_snapshot: number;
  }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const month = localMonthKey(row.received_at);
    const rate = Number(row.rate_per_usd_snapshot) || 1;
    totals[month] = (totals[month] ?? 0) + Number(row.amount) / rate;
  }
  return totals;
}

// Totals count live money only, so a voided-only view has no total to show.
export function periodTotalUsd(
  monthly: Record<string, number>,
  onlyVoided: boolean,
): number | null {
  if (onlyVoided) return null;
  return Object.values(monthly).reduce((sum, value) => sum + value, 0);
}
