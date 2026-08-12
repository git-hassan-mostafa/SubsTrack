import { MONTHS } from "@/src/core/constants";
import { toBillingMonth } from "@/src/core/utils/date";
import i18n from "@/src/core/i18n";

// "Pay the oldest month first", and its mirror "void the newest month first" —
// the pure rules, shared by the UI gates and the service guards so each exists
// exactly once. Billing months are always YYYY-MM-01, so plain string
// comparison is chronological.

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

/**
 * The NEWER paid months that must be voided before `targetMonths` may be —
 * empty when the void is allowed. The exact mirror of `blockingUnpaidMonths`:
 * voids run newest-first, so undoing a month never leaves a paid month sitting
 * on top of an unpaid one (the "✓ Paid + Overdue" shape the pay rule exists to
 * prevent).
 *
 * `paidMonths` is every month the line currently has covered. A month inside the
 * same write never blocks it, so voiding a whole block — or several months at
 * once — is fine. Returned NEWEST first: that is the one the user must void next.
 *
 * An **unskip** is judged by the same rule (it turns "nothing expected" back into
 * an unpaid month), so it shares this helper — see
 * `PaymentService.assertUnskippableInOrder`.
 */
export function blockingPaidMonths(
  paidMonths: string[],
  targetMonths: string[],
): string[] {
  if (paidMonths.length === 0 || targetMonths.length === 0) return [];
  const earliest = targetMonths.reduce((a, b) => (b < a ? b : a));
  const inWrite = new Set(targetMonths);
  return paidMonths
    .filter((m) => m > earliest && !inWrite.has(m))
    .sort()
    .reverse();
}

/** "March 2026" for a YYYY-MM-01 billing month, in the current language. */
export function billingMonthLabel(billingMonth: string): string {
  const [year, month] = billingMonth.split("-").map(Number);
  return `${i18n.t(`months.${MONTHS[month - 1]}`)} ${year}`;
}
