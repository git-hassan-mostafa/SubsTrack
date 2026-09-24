import type { BranchFilter } from "@/src/core/constants";
import type {
  Currency,
  Customer,
  CustomerPlan,
  DebtsView,
  MonthBill,
  OpenItem,
  SkippedMonth,
  UnpaidStartRule,
} from "@/src/core/types";
import { chargeService } from "./ChargeService";
import { mergeOwed } from "../utils/mergeOwed";
import { keyOf } from "../utils/waterfall";
import { groupBy } from "@/src/core/utils/groupBy";

const OWED_BATCH_SIZE = 100;

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
    const { customer, lines } = args;
    const active = lines.filter((l) => l.active);
    const [open, billsByLine] = await Promise.all([
      chargeService.getOpenCharges({ customerId: customer.id }),
      active.length > 0
        ? chargeService.getMonthBillsForLines(active.map((l) => l.id))
        : Promise.resolve(new Map<string, MonthBill[]>()),
    ]);
    return mergeOwed({ ...args, stored: open, billsByLine });
  }

  // getOwed for many customers: the same merge, one read per chunk of 100.
  async getOwedForCustomers(args: {
    customers: Customer[];
    skips: SkippedMonth[];
    unpaidRule: UnpaidStartRule;
    currencies: Currency[];
    today?: Date;
  }): Promise<Map<string, OpenItem[]>> {
    const owed = new Map<string, OpenItem[]>();
    const skipsByCustomer = groupBy(args.skips, (s) => s.customerId);
    for (let i = 0; i < args.customers.length; i += OWED_BATCH_SIZE) {
      const chunk = args.customers.slice(i, i + OWED_BATCH_SIZE);
      const lineIds = chunk.flatMap((c) =>
        (c.customerPlans ?? []).filter((l) => l.active).map((l) => l.id),
      );
      const [open, billsByLine] = await Promise.all([
        chargeService.getOpenCharges({ customerIds: chunk.map((c) => c.id) }),
        lineIds.length > 0
          ? chargeService.getMonthBillsForLines(lineIds)
          : Promise.resolve(new Map<string, MonthBill[]>()),
      ]);
      const openByCustomer = groupBy(open, (item) => item.customerId);
      for (const customer of chunk) {
        owed.set(
          customer.id,
          mergeOwed({
            customer,
            lines: customer.customerPlans ?? [],
            skips: skipsByCustomer.get(customer.id) ?? [],
            unpaidRule: args.unpaidRule,
            currencies: args.currencies,
            stored: openByCustomer.get(customer.id) ?? [],
            billsByLine,
            today: args.today,
          }),
        );
      }
    }
    return owed;
  }

  async getDebtsView(branchFilter: BranchFilter = null): Promise<DebtsView> {
    const open = await chargeService.getOpenCharges({ branchFilter });
    return chargeService.buildDebtsView(open);
  }

  getMonthBillsForLines(
    customerPlanIds: string[],
  ): Promise<Map<string, MonthBill[]>> {
    return chargeService.getMonthBillsForLines(customerPlanIds);
  }

  keyOf = keyOf;
}

export const ledgerService = new LedgerService();
