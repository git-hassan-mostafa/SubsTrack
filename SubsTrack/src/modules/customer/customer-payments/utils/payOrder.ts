import { MONTHS } from "@/src/core/constants";
import { toBillingMonth } from "@/src/core/utils/date";
import i18n from "@/src/core/i18n";

// "Pay the oldest month first" — the pure rule, shared by the UI gate and the
// service guard so it exists exactly once. Billing months are always YYYY-MM-01,
// so plain string comparison is chronological.

/** Every billing month a payment covers (a multi-month block covers N of them). */
export function coveredBillingMonths(
  billingMonth: string,
  durationMonths: number,
): string[] {
  const [year, month] = billingMonth.split("-").map(Number);
  return Array.from({ length: Math.max(1, durationMonths) }, (_, d) => {
    const date = new Date(year, month - 1 + d, 1);
    return toBillingMonth(date.getFullYear(), date.getMonth() + 1);
  });
}

/**
 * The older months that must be settled before `targetMonths` may be paid —
 * empty when the payment is allowed.
 *
 * `unpaidMonths` is the line's still-unpaid months (oldest first). A month that
 * is part of the same write never blocks it, so paying January + February
 * together is fine while paying only February is not.
 */
export function blockingUnpaidMonths(
  unpaidMonths: string[],
  targetMonths: string[],
): string[] {
  if (unpaidMonths.length === 0 || targetMonths.length === 0) return [];
  const latest = targetMonths.reduce((a, b) => (b > a ? b : a));
  const inWrite = new Set(targetMonths);
  return unpaidMonths.filter((m) => m < latest && !inWrite.has(m));
}

/** "March 2026" for a YYYY-MM-01 billing month, in the current language. */
export function billingMonthLabel(billingMonth: string): string {
  const [year, month] = billingMonth.split("-").map(Number);
  return `${i18n.t(`months.${MONTHS[month - 1]}`)} ${year}`;
}
