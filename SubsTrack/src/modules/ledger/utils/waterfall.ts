import type { AllocationLine, OpenItem } from '@/src/core/types';


/**
 * Order in which money settles bills. FOUR levels, on purpose:
 *  1. dueDate    — when it HAD to be paid. Never the date it was typed, or a
 *                  custom debt back-dated to 2020 would jump the whole queue
 *                  (the old gotcha #74 in a new place).
 *  2. issuedAt   — a January month billed today loses to one billed last week.
 *  3. createdAt
 *  4. key        — total order, so the preview and the save can never disagree
 *                  and two devices splitting the same money land identically.
 */
export function compareOpenItems(a: OpenItem, b: OpenItem): number {
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    a.issuedAt.localeCompare(b.issuedAt) ||
    a.createdAt.localeCompare(b.createdAt) ||
    keyOf(a).localeCompare(keyOf(b))
  );
}

/** Items in the order money settles them. */
export function sortByDue(items: OpenItem[]): OpenItem[] {
  return [...items].sort(compareOpenItems);
}

/**
 * A stable identity for an item, including a VIRTUAL month that has no charge
 * row yet — its natural key is what the deterministic id is hashed from, so it
 * orders the same on every device.
 */
export function keyOf(item: OpenItem): string {
  return item.chargeId ?? `${item.customerPlanId}:${item.billingMonth}`;
}

export interface AllocationResult {
  lines: AllocationLine[];
  leftover: number;
}

/**
 * Spread `amount` over `items`, oldest due date first, filling each bill
 * COMPLETELY before moving to the next. Never proportional: a customer settles
 * his oldest bill, he does not part-pay all of them.
 *
 * `items` must already be scoped to ONE currency by the caller — a collection
 * is single-currency, which is what lets a balance close at exactly zero.
 */
export function allocate(amount: number, items: OpenItem[]): AllocationResult {
  const lines: AllocationLine[] = [];
  let left = round(amount);

  for (const item of sortByDue(items)) {
    if (left <= 0) break;
    if (item.balance <= 0) continue;
    const take = round(Math.min(left, item.balance));
    if (take <= 0) continue;
    lines.push({ item, amount: take, settles: take >= item.balance });
    left = round(left - take);
  }

  return { lines, leftover: left };
}

/**
 * Re-run the split after staff unticked some rows in the preview. The excluded
 * items simply leave the pool, so the same money flows down to the next one.
 */
export function allocateExcluding(
  amount: number,
  items: OpenItem[],
  excludedKeys: ReadonlySet<string>,
): AllocationResult {
  return allocate(
    amount,
    items.filter((i) => !excludedKeys.has(keyOf(i))),
  );
}

/** The most that can be collected from this pool — the overpay ceiling. */
export function totalOwed(items: OpenItem[]): number {
  return round(items.reduce((sum, i) => sum + Math.max(0, i.balance), 0));
}

/**
 * Money is stored as NUMERIC(20,8); 8 decimals is also what a divided unit cost
 * keeps. Rounding here (rather than at display) stops 0.1 + 0.2 leaving a
 * millionth of a cent behind and a bill that never closes.
 */
function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
