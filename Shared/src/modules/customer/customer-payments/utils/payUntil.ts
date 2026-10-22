import type {
  CustomerPlan,
  MonthBill,
  MonthEntry,
  SkippedMonth,
  UnpaidStartRule,
} from "@shared/core/types";
import {
  getCurrentYearMonth,
  shiftBillingMonth,
  toBillingMonth,
} from "@shared/core/utils/date";
import {
  isPayBlocked,
  isPayableStatus,
  type LineGates,
} from "@shared/modules/customer/customer-payments/utils/monthActions";
import {
  isPartialMonth,
  isWrittenOffMonth,
} from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import { buildMonthGrid } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { blockStartMonth } from "@shared/modules/customer/customer-payments/utils/monthSelection";
import { paidUntil } from "@shared/modules/customer/customer-payments/utils/paidUntil";

export const PAY_UNTIL_MONTHS = 12;

export interface PayUntilChoice {
  lastMonth: string;
  months: MonthEntry[];
  paidUntil: string;
}

export interface PayUntilInput {
  line: CustomerPlan;
  bills: MonthBill[];
  skips: SkippedMonth[];
  unpaidRule: UnpaidStartRule;
  gates: LineGates;
  durationMonths: number;
}

// After the newest paid month, or this month if later: whole months only.
export function payUntilStart(
  startDate: string,
  paidMonths: readonly string[],
  durationMonths: number,
): string {
  const { year, month } = getCurrentYearMonth();
  const newest = paidMonths[paidMonths.length - 1];
  const candidates = [toBillingMonth(year, month), `${startDate.slice(0, 7)}-01`];
  if (newest) candidates.push(shiftBillingMonth(newest, 1));
  const from = candidates.reduce((a, b) => (a > b ? a : b));
  return durationMonths > 1 ? blockStartMonth(from, startDate, durationMonths) : from;
}

// One choice per payable block for a year; a part-paid newest month joins each.
export function payUntilChoices({
  line,
  bills,
  skips,
  unpaidRule,
  gates,
  durationMonths,
}: PayUntilInput): PayUntilChoice[] {
  const span = Math.max(1, durationMonths);
  const years = new Map<number, MonthEntry[]>();
  const cellAt = (billingMonth: string): MonthEntry => {
    const year = Number(billingMonth.slice(0, 4));
    let grid = years.get(year);
    if (!grid) {
      grid = buildMonthGrid(line, bills, skips, year, unpaidRule);
      years.set(year, grid);
    }
    return grid[Number(billingMonth.slice(5, 7)) - 1];
  };

  const newest = gates.paidMonths[gates.paidMonths.length - 1];
  const newestCell = newest ? cellAt(newest) : null;
  const months =
    newestCell && isPartialMonth(newestCell) && !isWrittenOffMonth(newestCell)
      ? [newestCell]
      : [];

  const choices: PayUntilChoice[] = [];
  const start = payUntilStart(line.startDate, gates.paidMonths, span);
  const end = shiftBillingMonth(start, PAY_UNTIL_MONTHS);
  for (let block = start; block < end; block = shiftBillingMonth(block, span)) {
    const first = cellAt(block);
    if (isPayBlocked(first, gates)) break;
    if (!isPayableStatus(first, gates)) continue;
    for (let d = 0; d < span; d++) months.push(cellAt(shiftBillingMonth(block, d)));
    const lastMonth = shiftBillingMonth(block, span - 1);
    choices.push({ lastMonth, months: [...months], paidUntil: paidUntil([lastMonth])! });
  }
  return choices;
}
