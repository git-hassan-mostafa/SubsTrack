import type {
  CustomerPlan,
  MonthBill,
  MonthEntry,
  SkippedMonth,
  UnpaidStartRule,
} from "@/src/core/types";
import { paymentService } from "@/src/modules/customer/customer-payments";

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
): LineDerivations {
  const grids: Record<string, MonthEntry[]> = {};
  const uncoveredMonths: Record<string, string[]> = {};
  const paidMonths: Record<string, string[]> = {};
  for (const line of lines) {
    const lineBills = bills.filter((b) => b.charge.customerPlanId === line.id);
    const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
    grids[line.id] = paymentService.buildMonthGrid(line, lineBills, lineSkips, year, unpaidRule);
    // Through the VIEWED year — that is the furthest month the user can tap.
    uncoveredMonths[line.id] = paymentService.uncoveredBillingMonths(
      line,
      lineBills,
      lineSkips,
      unpaidRule,
      year,
    );
    paidMonths[line.id] = paymentService.paidBillingMonths(lineBills);
  }
  return { grids, uncoveredMonths, paidMonths };
}
