import { groupBy } from "@shared/core/utils/groupBy";
import { balanceUsd, isDebtItem } from "@shared/modules/ledger/utils/debtRule";
import { owedOf } from "@shared/modules/ledger/utils/mergeOwed";
import type { CustomerStatusFacts } from "@shared/modules/customer/customers/utils/customerStatusFacts";

// The dashboard's Total to collect per customer, on the server's facts — gotcha #184.
export function toCollectByCustomer(facts: CustomerStatusFacts): Map<string, number> {
  const billsByLine = groupBy(facts.bills, (b) => b.charge.customerPlanId ?? "");
  const skipsByCustomer = groupBy(facts.skips, (s) => s.customerId);
  const openByCustomer = groupBy(facts.open, (bill) => bill.customerId);
  const totals = new Map<string, number>();
  for (const customer of facts.customers) {
    const stored = openByCustomer.get(customer.id) ?? [];
    const owed =
      customer.active && customer.isRegular
        ? owedOf({
            customer,
            lines: customer.customerPlans,
            skips: skipsByCustomer.get(customer.id) ?? [],
            unpaidRule: facts.unpaidRule,
            currencies: facts.currencies,
            stored,
            billsByLine,
            prices: facts.prices,
          })
        : stored.filter((bill) => isDebtItem(bill.kind, bill.paid));
    const usd = owed.reduce(
      (sum, item) => sum + balanceUsd(item.balance, item.ratePerUsdSnapshot),
      0,
    );
    if (usd > 0) totals.set(customer.id, usd);
  }
  return totals;
}
