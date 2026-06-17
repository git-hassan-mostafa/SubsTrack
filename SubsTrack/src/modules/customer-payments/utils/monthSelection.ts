import type { Customer, MonthEntry } from "@/src/core/types";
import { toBillingMonth } from "@/src/core/utils/date";

// Absolute month index (year * 12 + zero-based month) — lets us reason about
// consecutive months across year boundaries with plain integer arithmetic.
function absOf(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function billingMonthFromAbs(abs: number): string {
  return toBillingMonth(Math.floor(abs / 12), (abs % 12) + 1);
}

function planDuration(customer: Customer): number {
  return customer.plan?.durationMonths ?? 1;
}

function startAbs(customer: Customer): number {
  const d = new Date(customer.startDate);
  return absOf(d.getFullYear(), d.getMonth() + 1);
}

// First month of the start-aligned N-month window that contains `abs`. Windows
// are anchored at the customer's subscription start month so they never overlap
// and never begin before the start date.
function blockStartAbs(abs: number, customer: Customer, n: number): number {
  const base = startAbs(customer);
  return base + Math.floor((abs - base) / n) * n;
}

function hasActivePayment(entry: MonthEntry): boolean {
  return (
    (entry.status === "paid" || entry.status === "partial") &&
    entry.payment != null &&
    entry.payment.voidedAt === null
  );
}

function isPayable(entry: MonthEntry): boolean {
  return entry.status === "unpaid" || entry.status === "future";
}

/**
 * The set of billing months that should select/deselect together when the user
 * toggles `entry`:
 * - cell backed by an active payment → every visible month sharing that payment
 *   (keeps a multi-month block whole for voiding);
 * - multi-month plan + payable cell → the visible payable months of its
 *   start-aligned window;
 * - otherwise → just the cell itself.
 * Returns `[]` for non-selectable cells (e.g. before_start).
 */
export function expandSelectionUnit(
  entry: MonthEntry,
  monthGrid: MonthEntry[],
  customer: Customer,
): string[] {
  if (hasActivePayment(entry)) {
    const paymentId = entry.payment!.id;
    return monthGrid
      .filter((m) => m.payment?.id === paymentId)
      .map((m) => m.billingMonth);
  }

  if (!isPayable(entry)) return [];

  const n = planDuration(customer);
  if (n > 1) {
    const blockStart = blockStartAbs(absOf(entry.year, entry.month), customer, n);
    const blockEnd = blockStart + n - 1;
    return monthGrid
      .filter((m) => {
        const abs = absOf(m.year, m.month);
        return abs >= blockStart && abs <= blockEnd && isPayable(m);
      })
      .map((m) => m.billingMonth);
  }

  return [entry.billingMonth];
}

/**
 * Groups the selected payable months of a multi-month plan into the distinct
 * blocks that should each become one `createMultiMonthPayment` call. The block
 * start may fall before the visible grid year if a window straddles a boundary.
 */
export function groupPayableBlocks(
  payableEntries: MonthEntry[],
  customer: Customer,
): { startBillingMonth: string }[] {
  const n = planDuration(customer);
  const starts = new Set<number>();
  for (const entry of payableEntries) {
    starts.add(blockStartAbs(absOf(entry.year, entry.month), customer, n));
  }
  return Array.from(starts)
    .sort((a, b) => a - b)
    .map((abs) => ({ startBillingMonth: billingMonthFromAbs(abs) }));
}
