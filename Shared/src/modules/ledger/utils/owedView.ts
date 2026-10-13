import type { CustomerDebts, DebtsView, OpenItem } from "@shared/core/types";
import { daysLate } from "@shared/core/utils/date";
import { balanceUsd } from "@shared/modules/ledger/utils/debtRule";

export interface CustomerOwedUsd {
  debtUsd: number;
  toCollectUsd: number;
}

export function customerOwedItems(customer: CustomerDebts): OpenItem[] {
  return [...customer.items, ...customer.unpaidMonths];
}

export function customerOwedUsd(customer: CustomerDebts): number {
  return customer.debtUsd + customer.unpaidMonthsUsd;
}

const byDue = (a: OpenItem, b: OpenItem) => a.dueDate.localeCompare(b.dueDate);

// One row per customer owing anything: debts in `items`, plain unpaid months in `unpaidMonths`.
export function buildOwedView(owed: OpenItem[], today: Date = new Date()): DebtsView {
  const byCustomer = new Map<string, CustomerDebts>();
  const totals = { month: 0, sale: 0, manual: 0 };
  for (const item of owed) {
    let entry = byCustomer.get(item.customerId);
    if (!entry) {
      entry = {
        customerId: item.customerId,
        customerName: item.customerName,
        items: [],
        unpaidMonths: [],
        debtUsd: 0,
        unpaidMonthsUsd: 0,
        oldestDaysLate: 0,
      };
      byCustomer.set(item.customerId, entry);
    }
    const usd = balanceUsd(item.balance, item.ratePerUsdSnapshot);
    totals[item.kind] += usd;
    if (item.isDebt) {
      entry.items.push(item);
      entry.debtUsd += usd;
    } else {
      entry.unpaidMonths.push(item);
      entry.unpaidMonthsUsd += usd;
    }
  }

  const customers = [...byCustomer.values()];
  for (const entry of customers) {
    entry.items.sort(byDue);
    entry.unpaidMonths.sort(byDue);
    const oldest = [entry.items[0], entry.unpaidMonths[0]]
      .filter((item): item is OpenItem => item !== undefined)
      .sort(byDue)[0];
    entry.oldestDaysLate = daysLate(oldest.dueDate, today);
  }
  customers.sort(
    (a, b) =>
      b.oldestDaysLate - a.oldestDaysLate || customerOwedUsd(b) - customerOwedUsd(a),
  );

  return {
    customers,
    summary: {
      totalUsd: totals.month + totals.sale + totals.manual,
      monthsUsd: totals.month,
      salesUsd: totals.sale,
      manualUsd: totals.manual,
      customerCount: customers.length,
      writtenOffUsd: 0,
    },
  };
}

// One customer's To collect entry, the same shape the page holds; empty when owing nothing.
export function customerOwedEntry(
  customer: { id: string; name: string },
  owed: OpenItem[],
  today: Date = new Date(),
): CustomerDebts {
  const theirs = owed.filter((item) => item.customerId === customer.id);
  return (
    buildOwedView(theirs, today).customers[0] ?? {
      customerId: customer.id,
      customerName: customer.name,
      items: [],
      unpaidMonths: [],
      debtUsd: 0,
      unpaidMonthsUsd: 0,
      oldestDaysLate: 0,
    }
  );
}

export function owedByCustomerOf(view: DebtsView): Record<string, CustomerOwedUsd> {
  const map: Record<string, CustomerOwedUsd> = {};
  for (const c of view.customers) {
    map[c.customerId] = { debtUsd: c.debtUsd, toCollectUsd: customerOwedUsd(c) };
  }
  return map;
}
