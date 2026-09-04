import type { BranchFilter } from '@/src/core/constants';
import type {
  Currency,
  Customer,
  CustomerPlan,
  DebtsView,
  MonthBill,
  OpenItem,
  SkippedMonth,
  UnpaidStartRule,
} from '@/src/core/types';
import { resolveLinePrice } from '@/src/modules/customer/customer-plans/utils/linePrice';
import { findCurrency } from '@/src/core/utils/currency';
import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import { chargeService } from './ChargeService';
import { virtualMonthItem } from '../utils/openItems';
import { keyOf, sortByDue } from '../utils/waterfall';

/**
 * The one place that answers "what does this customer owe?".
 *
 * It exists because the answer has two sources and only this layer can see
 * both: STORED bills (sales, custom fees, and any month money has touched) and
 * VIRTUAL unpaid months, which have no row until money reaches them and can
 * only be derived from the month grid.
 *
 * OWED  = everything with a balance. Only the waterfall consumes this.
 * DEBT  = the subset the Debts screen shows. A fully unpaid month is owed but
 *         NOT a debt — it is red in the grid, which is its own workflow.
 */
class LedgerService {
  async getOwed(args: {
    customer: Customer;
    lines: CustomerPlan[];
    skips: SkippedMonth[];
    unpaidRule: UnpaidStartRule;
    currencies: Currency[];
    today?: Date;
  }): Promise<OpenItem[]> {
    const { customer, lines, skips, unpaidRule, currencies } = args;
    const stored = (await chargeService.getOpenCharges({ customerId: customer.id })).map((i) => ({
      ...i,
      customerName: customer.name,
    }));

    const billed = new Set(
      stored
        .filter((i) => i.kind === 'month' && i.paid > 0)
        .map((i) => `${i.customerPlanId}:${i.billingMonth}`),
    );
    const virtual = await this.virtualUnpaidMonths({
      customer,
      lines,
      skips,
      unpaidRule,
      currencies,
      alreadyBilled: billed,
      today: args.today ?? new Date(),
    });

    const revalued = new Set(virtual.map((i) => `${i.customerPlanId}:${i.billingMonth}`));
    const kept = stored.filter(
      (i) =>
        i.kind !== 'month' ||
        i.paid > 0 ||
        !revalued.has(`${i.customerPlanId}:${i.billingMonth}`),
    );

    return sortByDue([...kept, ...virtual]);
  }

  private async virtualUnpaidMonths(args: {
    customer: Customer;
    lines: CustomerPlan[];
    skips: SkippedMonth[];
    unpaidRule: UnpaidStartRule;
    currencies: Currency[];
    alreadyBilled: ReadonlySet<string>;
    today: Date;
  }): Promise<OpenItem[]> {
    const { customer, lines, skips, unpaidRule, currencies, alreadyBilled, today } = args;
    const active = lines.filter((l) => l.active);
    if (active.length === 0) return [];

    const billsByLine = await chargeService.getMonthBillsForLines(active.map((l) => l.id));
    const out: OpenItem[] = [];

    for (const line of active) {
      const price = resolveLinePrice(line);
      if (!price.isFixed || price.amount === null || price.amount <= 0) continue;
      const ratePerUsd = findCurrency(currencies, price.currencyId)?.ratePerUsd ?? 1;

      const bills = billsByLine.get(line.id) ?? [];
      const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
      const startYear = new Date(line.startDate).getFullYear();

      for (let year = startYear; year <= today.getFullYear(); year++) {
        for (const entry of paymentService.buildMonthGrid(line, bills, lineSkips, year, unpaidRule)) {
          if (entry.status !== 'unpaid') continue;
          if (alreadyBilled.has(`${line.id}:${entry.billingMonth}`)) continue;
          out.push(
            virtualMonthItem({
              customerId: customer.id,
              customerName: customer.name,
              branchId: customer.branchId,
              customerPlanId: line.id,
              billingMonth: entry.billingMonth,
              durationMonths: price.durationMonths,
              planId: line.planId,
              label: `${entry.label} ${entry.year}${line.plan?.name ? ` · ${line.plan.name}` : ''}`,
              amount: price.amount,
              currencyId: price.currencyId,
              ratePerUsdSnapshot: ratePerUsd,
              dueDate: entry.billingMonth,
            }),
          );
        }
      }
    }
    return out;
  }

  async getDebtsView(branchFilter: BranchFilter = null): Promise<DebtsView> {
    const open = await chargeService.getOpenCharges({ branchFilter });
    return chargeService.buildDebtsView(open);
  }

  getMonthBillsForLines(customerPlanIds: string[]): Promise<Map<string, MonthBill[]>> {
    return chargeService.getMonthBillsForLines(customerPlanIds);
  }

  keyOf = keyOf;
}

export const ledgerService = new LedgerService();
