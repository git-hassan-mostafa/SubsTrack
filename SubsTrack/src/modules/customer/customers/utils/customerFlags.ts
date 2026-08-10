import type { CustomerMonthStatus, CustomerStatus } from "@/src/core/types";

/**
 * A payment pill on a customer card: the customer's settle status, plus the
 * separate "an earlier month is still unpaid" fact.
 */
export type CustomerFlag = CustomerMonthStatus | "overdue";

/**
 * The payment pills one customer's card shows, in display order — and the ONLY
 * place that is decided. The list's filter tabs read the same helper, so a tab
 * can never disagree with the badge on the card inside it (gotcha #56).
 *
 * `status` and `overdue` stay two independent facts, so "N/M plans paid +
 * Overdue" displays both. Nothing here has to suppress "✓ Paid": a customer is
 * only `paid` when they owe nothing at all, which rules `overdue` out at the
 * source. The one suppression left: months are settled oldest-first, so
 * "Overdue" already means the customer owes this month — the plain "Unpaid"
 * pill would only repeat it.
 *
 * A `null` status means "not computed yet" — no flags, never a guessed "Unpaid".
 */
export function customerFlags(status: CustomerStatus | null): CustomerFlag[] {
  if (!status) return [];
  const flags: CustomerFlag[] = [];
  if (!(status.status === "unpaid" && status.overdue)) flags.push(status.status);
  if (status.overdue) flags.push("overdue");
  return flags;
}
