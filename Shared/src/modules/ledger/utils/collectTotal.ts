import type {
  ChargeKind,
  Currency,
  Customer,
  MonthBill,
  OpenItem,
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
  skips: SkippedMonth[];
  unpaidRule: UnpaidStartRule;
  currencies: Currency[];
  today?: Date;
}

// `customers` = active regular only; anyone else counts their Debts — gotcha #184.
export function collectTotal(args: CollectTotalArgs): CollectTotal {
  const storedByCustomer = groupBy(args.stored, (item) => item.customerId);
  const skipsByCustomer = groupBy(args.skips, (s) => s.customerId);
  const withMonths = new Set(args.customers.map((c) => c.id));
  const unpriced = new Set<string>();
  const byKind: Record<ChargeKind, number> = { month: 0, sale: 0, manual: 0 };
  const add = (items: OpenItem[]) => {
    for (const item of items) {
      byKind[item.kind] += balanceUsd(item.balance, item.ratePerUsdSnapshot);
    }
  };

  add(args.stored.filter((item) => !withMonths.has(item.customerId) && item.isDebt));
  for (const customer of args.customers) {
    const owedOf = (withOpenMonths: boolean) =>
      mergeOwed({
        customer,
        lines: customer.customerPlans ?? [],
        skips: skipsByCustomer.get(customer.id) ?? [],
        unpaidRule: args.unpaidRule,
        currencies: args.currencies,
        stored: storedByCustomer.get(customer.id) ?? [],
        billsByLine: args.billsByLine,
        today: args.today,
        withOpenMonths,
      });
    add(owedOf(false));
    for (const item of owedOf(true)) {
      if (item.openAmount && item.customerPlanId) unpriced.add(item.customerPlanId);
    }
  }
  return {
    totalUsd: byKind.month + byKind.sale + byKind.manual,
    byKind,
    unpricedLines: unpriced.size,
  };
}
