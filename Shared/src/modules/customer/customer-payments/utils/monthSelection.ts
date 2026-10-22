import type { CustomerPlan, MonthEntry } from "@shared/core/types";
import { toBillingMonth } from "@shared/core/utils/date";

// Absolute month index (year * 12 + zero-based month) — lets us reason about
// consecutive months across year boundaries with plain integer arithmetic.
function absOf(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function billingMonthFromAbs(abs: number): string {
  return toBillingMonth(Math.floor(abs / 12), (abs % 12) + 1);
}

function planDuration(line: CustomerPlan): number {
  return line.plan?.durationMonths ?? 1;
}

function startAbs(startDate: string): number {
  const d = new Date(startDate);
  return absOf(d.getFullYear(), d.getMonth() + 1);
}

function blockStartAbs(abs: number, startDate: string, n: number): number {
  const base = startAbs(startDate);
  return base + Math.floor((abs - base) / n) * n;
}

// N-month windows anchored at the line's start never overlap — gotcha #194.
export function blockStartMonth(billingMonth: string, startDate: string, n: number): string {
  const [year, month] = billingMonth.split("-").map(Number);
  return billingMonthFromAbs(blockStartAbs(absOf(year, month), startDate, n));
}

// Money has reached this month. Keyed off the AMOUNT, never on a bill row
// existing — a bill emptied by a voided collection must behave like a month
// that was never touched.
function hasMoney(entry: MonthEntry): boolean {
  return entry.status === "paid" && entry.collected > 0;
}

// No money yet and collectable: a "No service" month can still be paid.
export function isPayableMonth(entry: Pick<MonthEntry, "status">): boolean {
  return (
    entry.status === "unpaid" ||
    entry.status === "future" ||
    entry.status === "no_service"
  );
}

/**
 * The set of billing months that should select/deselect together when the user
 * toggles `entry`:
 * - cell money has reached → every visible month sharing that bill (keeps a
 *   multi-month block whole);
 * - skipped cell → just itself (it can only be unskipped);
 * - multi-month plan + payable cell → the visible payable months of its
 *   start-aligned window;
 * - otherwise → just the cell itself.
 * Returns `[]` for non-selectable cells (e.g. before_start).
 */
export function expandSelectionUnit(
  entry: MonthEntry,
  monthGrid: MonthEntry[],
  line: CustomerPlan,
): string[] {
  if (hasMoney(entry)) {
    const chargeId = entry.charge!.id;
    return monthGrid
      .filter((m) => m.charge?.id === chargeId)
      .map((m) => m.billingMonth);
  }

  if (entry.status === "skipped") return [entry.billingMonth];

  if (!isPayableMonth(entry)) return [];

  const n = planDuration(line);
  if (n > 1) {
    const blockStart = blockStartAbs(absOf(entry.year, entry.month), line.startDate, n);
    const blockEnd = blockStart + n - 1;
    return monthGrid
      .filter((m) => {
        const abs = absOf(m.year, m.month);
        return abs >= blockStart && abs <= blockEnd && isPayableMonth(m);
      })
      .map((m) => m.billingMonth);
  }

  return [entry.billingMonth];
}

/**
 * Groups the selected payable months of a multi-month plan into the distinct
 * blocks that each become ONE bill. The block start may fall before the visible
 * grid year if a window straddles a boundary.
 */
export function groupPayableBlocks(
  payableEntries: MonthEntry[],
  line: CustomerPlan,
): { startBillingMonth: string }[] {
  const n = planDuration(line);
  const starts = new Set<number>();
  for (const entry of payableEntries) {
    starts.add(blockStartAbs(absOf(entry.year, entry.month), line.startDate, n));
  }
  return Array.from(starts)
    .sort((a, b) => a - b)
    .map((abs) => ({ startBillingMonth: billingMonthFromAbs(abs) }));
}

// A checkbox table reports the new set; every changed month brings its unit.
export function applySelectionChange(
  current: ReadonlySet<string>,
  next: ReadonlySet<string>,
  unitOf: (billingMonth: string) => string[],
): string[] {
  const result = new Set(current);
  for (const month of current) {
    if (!next.has(month)) unitOf(month).forEach((m) => result.delete(m));
  }
  for (const month of next) {
    if (!current.has(month)) unitOf(month).forEach((m) => result.add(m));
  }
  return [...result];
}
