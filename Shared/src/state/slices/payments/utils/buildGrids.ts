import type {
  CustomerPlan,
  LineUsage,
  MonthBill,
  MonthEntry,
  SkippedMonth,
  UnpaidStartRule,
} from "@shared/core/types";
import {
  buildMonthGrid,
  uncoveredBillingMonths,
  paidBillingMonths,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";

/** The viewed year's grids plus the two gate lists the UI reads. */
export interface LineDerivations {
  grids: Record<string, MonthEntry[]>;
  uncoveredMonths: Record<string, string[]>;
  paidMonths: Record<string, string[]>;
}

/** One pass per line: the grid plus the two gate lists the UI reads. */
export function buildGridsFor(
  lines: CustomerPlan[],
  bills: MonthBill[],
  skips: SkippedMonth[],
  year: number,
  unpaidRule: UnpaidStartRule,
  usageByLine: ReadonlyMap<string, LineUsage> = new Map(),
): LineDerivations {
  const grids: Record<string, MonthEntry[]> = {};
  const uncoveredMonths: Record<string, string[]> = {};
  const paidMonths: Record<string, string[]> = {};
  for (const line of lines) {
    const lineBills = bills.filter((b) => b.charge.customerPlanId === line.id);
    const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
    const usage = usageByLine.get(line.id) ?? null;
    grids[line.id] = buildMonthGrid(
      line,
      lineBills,
      lineSkips,
      year,
      unpaidRule,
      usage,
    );
    uncoveredMonths[line.id] = uncoveredBillingMonths(
      line,
      lineBills,
      lineSkips,
      unpaidRule,
      year,
      usage,
    );
    paidMonths[line.id] = paidBillingMonths(lineBills);
  }
  return { grids, uncoveredMonths, paidMonths };
}
