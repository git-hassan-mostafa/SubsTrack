import type {
  ChargeKind,
  Currency,
  Customer,
  MonthBill,
  OpenItem,
  PriceHistory,
  SkippedMonth,
  UnpaidStartRule,
} from "@shared/core/types";
import { groupBy } from "@shared/core/utils/groupBy";
import { mergeOwed } from "@shared/modules/ledger/utils/mergeOwed";
import { balanceUsd } from "@shared/modules/ledger/utils/debtRule";

export interface CollectTotal {
  totalUsd: number;
  byKind: Record<ChargeKind, number>;
  unpricedLines: number;
}

export interface CollectTotalArgs {
  customers: Customer[];
  stored: OpenItem[];
  billsByLine: Map<string, MonthBill[]>;
  prices?: PriceHistory;
  skips: SkippedMonth[];
  unpaidRule: UnpaidStartRule;
  currencies: Currency[];
  today?: Date;
}

function owedPerCustomer(args: CollectTotalArgs) {
  const storedByCustomer = groupBy(args.stored, (item) => item.customerId);
  const skipsByCustomer = groupBy(args.skips, (s) => s.customerId);
  return (customer: Customer, withOpenMonths: boolean) =>
    mergeOwed({
      customer,
      lines: customer.customerPlans ?? [],
      skips: skipsByCustomer.get(customer.id) ?? [],
      unpaidRule: args.unpaidRule,
      currencies: args.currencies,
      stored: storedByCustomer.get(customer.id) ?? [],
      billsByLine: args.billsByLine,
      prices: args.prices,
      today: args.today,
      withOpenMonths,
    });
}

// `customers` = active regular only; anyone else owes their debts — gotcha #184.
export function owedItems(args: CollectTotalArgs): OpenItem[] {
  const withMonths = new Set(args.customers.map((c) => c.id));
  const owedOf = owedPerCustomer(args);
  return [
    ...args.stored.filter((item) => !withMonths.has(item.customerId) && item.isDebt),
    ...args.customers.flatMap((customer) => owedOf(customer, false)),
  ];
}

export function collectTotal(args: CollectTotalArgs): CollectTotal {
  const byKind: Record<ChargeKind, number> = { month: 0, sale: 0, manual: 0 };
  for (const item of owedItems(args)) {
    byKind[item.kind] += balanceUsd(item.balance, item.ratePerUsdSnapshot);
  }
  const owedOf = owedPerCustomer(args);
  const unpriced = new Set<string>();
  for (const customer of args.customers) {
    for (const item of owedOf(customer, true)) {
      if (item.openAmount && item.customerPlanId) unpriced.add(item.customerPlanId);
    }
  }
  return {
    totalUsd: byKind.month + byKind.sale + byKind.manual,
    byKind,
    unpricedLines: unpriced.size,
  };
}
