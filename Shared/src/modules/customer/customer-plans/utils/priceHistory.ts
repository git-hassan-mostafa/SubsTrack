import type {
  CustomerPlan,
  LinePriceChange,
  Plan,
  PlanPriceChange,
  PriceHistory,
} from "@shared/core/types";
import { getCurrentYearMonth, toBillingMonth } from "@shared/core/utils/date";
import { groupBy } from "@shared/core/utils/groupBy";
import {
  resolveLinePrice,
  type LinePrice,
  type PricedLine,
} from "@shared/modules/customer/customer-plans/utils/linePrice";

export const PRICE_START_MONTHS = 12;

export const EMPTY_PRICE_HISTORY: PriceHistory = {
  lines: new Map(),
  plans: new Map(),
};

export type PlanPriceFields = Pick<
  Plan,
  "price" | "currencyId" | "durationMonths" | "isCustomPrice"
>;

export type LinePriceFields = Pick<CustomerPlan, "customPrice" | "customCurrencyId">;

export type HistoricLine = PricedLine & Pick<CustomerPlan, "id">;

export type DatedPriceChange = { id: string; fromMonth: string | null; createdAt: string };

export function priceHistoryOf(args: {
  planChanges: PlanPriceChange[];
  lineChanges: LinePriceChange[];
}): PriceHistory {
  return {
    lines: groupBy(args.lineChanges, (c) => c.customerPlanId),
    plans: groupBy(args.planChanges, (c) => c.planId),
  };
}

export function isLater(a: DatedPriceChange, b: DatedPriceChange): boolean {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id);
}

// The latest edit reaching `month`; none → the price before the first edit.
export function changeAt<T extends DatedPriceChange>(
  changes: T[] | undefined,
  month: string,
): T | null {
  let reaching: T | null = null;
  let before: T | null = null;
  for (const change of changes ?? []) {
    if (change.fromMonth === null) before = change;
    else if (change.fromMonth <= month && (!reaching || isLater(change, reaching))) {
      reaching = change;
    }
  }
  return reaching ?? before;
}

export function sortPlanPriceHistory(history: PlanPriceChange[]): PlanPriceChange[] {
  return [...history].sort((a, b) => {
    if (a.fromMonth === null) return 1;
    if (b.fromMonth === null) return -1;
    if (a.createdAt === b.createdAt) return b.id.localeCompare(a.id);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// Only the newest price change can move its start month — gotcha #185.
export function canEditPriceStart(
  change: DatedPriceChange,
  allChanges: DatedPriceChange[],
): boolean {
  if (change.fromMonth === null) return false;
  return !allChanges.some(
    (c) => c.fromMonth !== null && c.id !== change.id && isLater(c, change),
  );
}

function planAt(plan: Plan, month: string, history: PriceHistory): Plan {
  const change = changeAt(history.plans.get(plan.id), month);
  if (!change) return plan;
  return {
    ...plan,
    price: change.price,
    currencyId: change.currencyId,
    durationMonths: change.durationMonths,
    isCustomPrice: change.isCustomPrice,
  };
}

// Line history holds only a special price; without one, the line's plan as priced then — #185.
export function linePriceAt(
  line: HistoricLine,
  billingMonth: string,
  history: PriceHistory,
): LinePrice {
  const change = changeAt(history.lines.get(line.id), billingMonth);
  const plan = line.plan ?? null;
  return resolveLinePrice({
    customPrice: change ? change.customPrice : line.customPrice,
    customCurrencyId: change ? change.customCurrencyId : line.customCurrencyId,
    plan: plan ? planAt(plan, billingMonth, history) : null,
  });
}

// A month priced unlike today — the collect form names the price it uses.
export function isEarlierPrice(month: LinePrice, today: LinePrice): boolean {
  if (!month.isFixed || month.amount === null || month.kind === "usage") return false;
  return (
    month.amount !== today.amount ||
    month.currencyId !== today.currencyId ||
    month.durationMonths !== today.durationMonths
  );
}

export function planPriceChanged(prev: PlanPriceFields, next: PlanPriceFields): boolean {
  if (prev.isCustomPrice !== next.isCustomPrice) return true;
  if (prev.durationMonths !== next.durationMonths) return true;
  if (next.isCustomPrice) return false;
  return prev.price !== next.price || prev.currencyId !== next.currencyId;
}

export function linePriceChanged(prev: LinePriceFields, next: LinePriceFields): boolean {
  if (prev.customPrice !== next.customPrice) return true;
  return next.customPrice !== null && prev.customCurrencyId !== next.customCurrencyId;
}

export function currentBillingMonth(): string {
  const { year, month } = getCurrentYearMonth();
  return toBillingMonth(year, month);
}

// Current month first, then back — a new price never starts in the future.
export function priceStartMonths(count = PRICE_START_MONTHS): string[] {
  const { year, month } = getCurrentYearMonth();
  return Array.from({ length: count }, (_, back) => {
    const day = new Date(year, month - 1 - back, 1);
    return toBillingMonth(day.getFullYear(), day.getMonth() + 1);
  });
}

export function isPriceStartMonth(month: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(month) && month <= currentBillingMonth();
}
