import type {
  Currency,
  Customer,
  CustomerPlan,
  CustomerStatus,
  OpenItem,
} from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { findCurrency } from "@shared/core/utils/currency";
import { getCurrentYearMonth, toBillingMonth } from "@shared/core/utils/date";
import { isBeforeStartDate } from "@shared/modules/customer/customer-payments/utils/monthDueRules";
import { activeLines } from "@shared/modules/customer/customer-plans/utils/activeLines";
import { resolveLinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import type { CollectInput } from "@shared/modules/ledger/services/CollectionService";
import { virtualMonthItem } from "@shared/modules/ledger/utils/openItems";

export interface QuickPayTarget {
  customer: Customer;
  status: CustomerStatus | null;
}

export interface BulkQuickPayPlan {
  requests: OpenItem[];
  typedCount: number;
  multiCount: number;
}

// Active lines that have started by this month, paid or not.
export function startedActiveLines(customer: Customer): CustomerPlan[] {
  const { year, month } = getCurrentYearMonth();
  return activeLines(customer).filter((l) => !isBeforeStartDate(year, month, l.startDate));
}

export function isMultiPlan(customer: Customer): boolean {
  return startedActiveLines(customer).length >= 2;
}

// An older uncovered month sends a line to the grid: months settle oldest first.
function linesDueThisMonth(customer: Customer, status: CustomerStatus | null): CustomerPlan[] {
  const notDue = new Set(status?.notDueLineIds);
  const uncovered = new Set(status?.uncoveredLineIds);
  return startedActiveLines(customer).filter((l) => !notDue.has(l.id) && !uncovered.has(l.id));
}

function monthLabel(line: CustomerPlan, billingMonth: string): string {
  const base = billingMonthLabel(billingMonth);
  return line.plan?.name ? `${base} · ${line.plan.name}` : base;
}

// This month of every line quick pay may touch; an unpriced line is an OPEN item.
export function currentMonthItems(
  customer: Customer,
  status: CustomerStatus | null,
  currencies: Currency[],
): OpenItem[] {
  const { year, month } = getCurrentYearMonth();
  const billingMonth = toBillingMonth(year, month);
  return linesDueThisMonth(customer, status).map((l) => {
    const price = resolveLinePrice(l);
    const priced = price.isFixed && price.amount !== null && price.amount > 0;
    return virtualMonthItem({
      customerId: customer.id,
      customerName: customer.name,
      branchId: customer.branchId,
      customerPlanId: l.id,
      billingMonth,
      durationMonths: price.durationMonths,
      planId: l.planId,
      label: monthLabel(l, billingMonth),
      amount: priced ? price.amount! : 0,
      currencyId: priced ? price.currencyId : null,
      ratePerUsdSnapshot: priced
        ? (findCurrency(currencies, price.currencyId)?.ratePerUsd ?? 1)
        : 1,
      dueDate: billingMonth,
      openAmount: !priced,
    });
  });
}

export function fixedMonthItems(
  customer: Customer,
  status: CustomerStatus | null,
  currencies: Currency[],
): OpenItem[] {
  return currentMonthItems(customer, status, currencies).filter((i) => !i.openAmount);
}

export function canQuickPay(customer: Customer, status: CustomerStatus | null): boolean {
  if (!customer.active || !customer.isRegular) return false;
  return linesDueThisMonth(customer, status).length > 0;
}

// Counted per LINE: a customer with one priced and one typed line is part-skipped.
export function bulkQuickPayPlan(targets: QuickPayTarget[], currencies: Currency[]): BulkQuickPayPlan {
  const items = targets
    .filter((target) => canQuickPay(target.customer, target.status))
    .flatMap((target) => currentMonthItems(target.customer, target.status, currencies));
  const requests = items.filter((i) => !i.openAmount);
  return {
    requests,
    typedCount: items.length - requests.length,
    multiCount: requests.filter((r) => r.durationMonths > 1).length,
  };
}

// One hand-over per customer PER CURRENCY — two piles of cash, two rows (#108).
export function quickPayInputs(
  items: OpenItem[],
  author: { tenantId: string; receivedByUserId: string },
  receivedAt: string,
): CollectInput[] {
  const groups = new Map<string, OpenItem[]>();
  for (const item of items) {
    const key = `${item.customerId}|${item.currencyId ?? "USD"}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()].map((group) => ({
    tenantId: author.tenantId,
    customerId: group[0].customerId,
    branchId: group[0].branchId,
    amount: group.reduce((sum, i) => sum + i.balance, 0),
    currencyId: group[0].currencyId,
    ratePerUsdSnapshot: group[0].ratePerUsdSnapshot,
    receivedAt,
    receivedByUserId: author.receivedByUserId,
    notes: null,
    lines: group.map((item) => ({ item, amount: item.balance, settles: true })),
  }));
}
