import type { Charge } from "@shared/core/types";

// THE debt rule: a fully unpaid month is owed, not a debt — gotcha #106c.
export function isDebtItem(kind: Charge["kind"], paid: number): boolean {
  return kind !== "month" || paid > 0;
}

// A bill's open balance in USD, at the rate frozen on the bill.
export function balanceUsd(
  balance: number,
  ratePerUsdSnapshot: number,
): number {
  return balance / ratePerUsdSnapshot;
}
