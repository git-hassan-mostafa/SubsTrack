import type {
  ChargeUsage,
  CustomerPlan,
  LineUsage,
  MonthCell,
  Plan,
  PriceHistory,
  StatusCharge,
  StatusPriceChange,
  StatusReading,
  UsageBill,
  UsageEntry,
  UsageMonth,
  UsageWait,
} from "@shared/core/types";
import { shiftBillingMonth } from "@shared/core/utils/date";
import { groupBy } from "@shared/core/utils/groupBy";
import type { LinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import {
  isLater,
  linePriceAt,
  type HistoricLine,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";

export type UsageSourceLine = Pick<
  CustomerPlan,
  "id" | "startDate" | "planId" | "startReading"
> & { plan?: Pick<Plan, "usage"> | null };

export interface UsageMonthPrice {
  unitPrice: number;
  fixedFee: number;
  currencyId: string | null;
  firstPricedAt: string;
}

type UsageUnits =
  | { units: number; previousReading: number | null }
  | { waitingFor: UsageWait };

const roundTo = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const waiting = (waitingFor: UsageWait): UsageMonth => ({ kind: "waiting", waitingFor });

export function lineUsageOf(
  line: UsageSourceLine,
  lineReadings: StatusReading[],
  history: PriceHistory,
): LineUsage | null {
  const usage = line.plan?.usage;
  if (!usage || !line.planId) return null;
  return {
    entry: usage.entry,
    startDate: line.startDate,
    startReading: line.startReading,
    readings: new Map(lineReadings.map((r) => [r.billingMonth, r])),
    prices: history.plans.get(line.planId) ?? [],
  };
}

// Fixed lines get no entry, so the month rules treat them as before.
export function usageByLineOf(
  lines: UsageSourceLine[],
  readings: (StatusReading & { customerPlanId: string })[],
  history: PriceHistory,
): Map<string, LineUsage> {
  const readingsByLine = groupBy(readings, (r) => r.customerPlanId);
  const byLine = new Map<string, LineUsage>();
  for (const line of lines) {
    const usage = lineUsageOf(line, readingsByLine.get(line.id) ?? [], history);
    if (usage) byLine.set(line.id, usage);
  }
  return byLine;
}

// A usage price reaches only its own month: the latest save wins, the first starts the clock.
export function usagePriceAt(
  prices: StatusPriceChange[],
  billingMonth: string,
): UsageMonthPrice | null {
  let latest: StatusPriceChange | null = null;
  let first: StatusPriceChange | null = null;
  for (const change of prices) {
    if (change.fromMonth !== billingMonth) continue;
    if (change.fixedFee === null || change.price === null) continue;
    if (!latest || isLater(change, latest)) latest = change;
    if (!first || isLater(first, change)) first = change;
  }
  if (!latest || !first) return null;
  return {
    unitPrice: latest.price ?? 0,
    fixedFee: latest.fixedFee ?? 0,
    currencyId: latest.currencyId,
    firstPricedAt: first.createdAt,
  };
}

// The start month counts from the line's start reading, every later month from the one before.
export function previousReadingOf(usage: LineUsage, billingMonth: string): number | null {
  if (billingMonth.slice(0, 7) === usage.startDate.slice(0, 7)) {
    return usage.startReading;
  }
  return usage.readings.get(shiftBillingMonth(billingMonth, -1))?.reading ?? null;
}

function unitsOf(
  usage: LineUsage,
  reading: StatusReading,
  billingMonth: string,
): UsageUnits {
  if (usage.entry === "direct") {
    return reading.units === null
      ? { waitingFor: "reading" }
      : { units: reading.units, previousReading: null };
  }
  if (reading.reading === null) return { waitingFor: "reading" };
  const previous = previousReadingOf(usage, billingMonth);
  if (previous === null) return { waitingFor: "previous_reading" };
  const change = reading.meterChange;
  const parts = change
    ? [change.oldMeterFinal - previous, reading.reading - change.newMeterStart]
    : [reading.reading - previous];
  if (parts.some((part) => part < 0)) return { waitingFor: "reading_below_previous" };
  return {
    units: roundTo(parts.reduce((sum, part) => sum + part, 0), 3),
    previousReading: previous,
  };
}

// Units alone, priced or not — what a new reading is checked against.
export function usageUnitsOf(usage: LineUsage, billingMonth: string): number | null {
  const reading = usage.readings.get(billingMonth);
  if (!reading) return null;
  const units = unitsOf(usage, reading, billingMonth);
  return "units" in units ? units.units : null;
}

// The ONLY place a usage bill is worked out: fixed fee + units × that month's unit price.
export function usageMonthOf(usage: LineUsage, billingMonth: string): UsageMonth {
  const reading = usage.readings.get(billingMonth);
  if (!reading) return waiting("reading");
  const units = unitsOf(usage, reading, billingMonth);
  if ("waitingFor" in units) return waiting(units.waitingFor);
  const price = usagePriceAt(usage.prices, billingMonth);
  if (!price) return waiting("price");
  return {
    kind: "bill",
    bill: {
      previousReading: units.previousReading,
      reading: usage.entry === "reading" ? reading.reading : null,
      units: units.units,
      unitPrice: price.unitPrice,
      fixedFee: price.fixedFee,
      amount: roundTo(price.fixedFee + units.units * price.unitPrice, 2),
      currencyId: price.currencyId,
      billedAt:
        reading.recordedAt > price.firstPricedAt ? reading.recordedAt : price.firstPricedAt,
    },
  };
}

export function workedOutBill(month: UsageMonth | null | undefined): UsageBill | null {
  return month?.kind === "bill" ? month.bill : null;
}

// The parts a saved usage bill keeps; computedAmount is what later shows a staff edit.
export function chargeUsageOf(bill: UsageBill): ChargeUsage {
  return {
    previousReading: bill.previousReading,
    reading: bill.reading,
    units: bill.units,
    unitPrice: bill.unitPrice,
    fixedFee: bill.fixedFee,
    computedAmount: bill.amount,
  };
}

// A usage month costs its worked-out bill, never plan price rows; others their price then.
export function monthPriceOf(
  line: HistoricLine,
  month: Pick<MonthCell, "billingMonth" | "usage">,
  history: PriceHistory,
): LinePrice {
  if (!line.plan?.usage) return linePriceAt(line, month.billingMonth, history);
  const bill = workedOutBill(month.usage);
  return {
    amount: bill?.amount ?? null,
    currencyId: bill?.currencyId ?? null,
    durationMonths: 1,
    isFixed: bill !== null,
    kind: "usage",
  };
}

// Staff typed this bill's amount, so it is owed as typed even without a worked-out bill.
export function isEditedUsageBill(charge: StatusCharge): boolean {
  return !!charge.usage && charge.amount !== charge.usage.computedAmount;
}

// The start reading starts the first month's bill, so money on that month locks it.
export function isStartReadingLocked(startDate: string, paidMonths: string[]): boolean {
  const startMonth = startDate.slice(0, 7);
  return paidMonths.some((month) => month.slice(0, 7) === startMonth);
}

// A meter reading also starts next month's bill, so money on either month locks it.
export function isReadingLocked(
  entry: UsageEntry,
  billingMonth: string,
  paidMonths: string[],
): boolean {
  const paid = new Set(paidMonths);
  if (paid.has(billingMonth)) return true;
  return entry === "reading" && paid.has(shiftBillingMonth(billingMonth, 1));
}
