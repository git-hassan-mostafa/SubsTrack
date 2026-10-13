import type { CustomerMonthStatus, CustomerStatus } from "@shared/core/types";

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
  if (!(status.status === "unpaid" && status.overdue))
    flags.push(status.status);
  if (status.overdue) flags.push("overdue");
  return flags;
}

// The money pill and the "Owes" filter both ask this, so they never disagree (#56).
export function owesMoney(usd: number | undefined): boolean {
  return (usd ?? 0) > 0;
}

// An uncomputed status hides nothing; a line with no set price adds no money.
export function hasAnythingOwed(
  status: CustomerStatus | null,
  toCollectUsd: number | undefined,
): boolean {
  if (owesMoney(toCollectUsd)) return true;
  return status ? !isSettledCustomer(status.status) : true;
}

function isSettledCustomer(status: CustomerMonthStatus): boolean {
  return status === "paid" || status === "written_off";
}
