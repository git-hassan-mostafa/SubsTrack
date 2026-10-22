import type {
  CustomerMonthStatus,
  CustomerStatus,
  PrepaidState,
} from "@shared/core/types";

// Settle status, "an earlier month is unpaid", and the soonest prepaid expiry.
export type CustomerFlag = CustomerMonthStatus | "overdue" | PrepaidState;

const SAID_BY_EXPIRY: readonly CustomerMonthStatus[] = ["paid", "not_due_yet", "skipped"];

// The ONLY place a card's payment pills are decided — month-grid.md rule 5, #56.
export function customerFlags(status: CustomerStatus | null): CustomerFlag[] {
  if (!status) return [];
  const flags: CustomerFlag[] = [];
  if (!(status.status === "unpaid" && status.overdue) && !expiryReplacesStatus(status))
    flags.push(status.status);
  if (status.overdue) flags.push("overdue");
  if (status.prepaid) flags.push(status.prepaid.state);
  return flags;
}

// An all-prepaid customer's expiry pill already says paid or not due.
function expiryReplacesStatus(status: CustomerStatus): boolean {
  return !!status.prepaid?.everyLine && SAID_BY_EXPIRY.includes(status.status);
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
