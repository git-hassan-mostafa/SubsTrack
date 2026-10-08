import type { BranchFilter } from "@shared/core/constants";
import type {
  Currency,
  Customer,
  CustomerPlan,
  DebtsView,
  MonthBill,
  OpenItem,
  SkippedMonth,
  UnpaidStartRule,
} from "@shared/core/types";
import { repositories } from "@shared/core/runtime/repositories";
import { mapDbCustomerToCustomer } from "@shared/modules/customer/customers/utils/mapper";
import skippedMonthService from "@shared/modules/customer/customer-payments/services/SkippedMonthService";
import currencyService from "@shared/modules/admin/currencies/services/CurrencyService";
import { chargeService } from "./ChargeService";
import { mergeOwed } from "../utils/mergeOwed";
import { collectTotal, type CollectTotal } from "../utils/collectTotal";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import { groupBy } from "@shared/core/utils/groupBy";
import { inChunks } from "@shared/core/utils/chunk";

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
    for (const chunk of inChunks(args.customers, OWED_BATCH_SIZE)) {
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

  // Debts and Total to collect from one read of the open bills — gotcha #184.
  async getOwedTotals(
    branchFilter: BranchFilter,
    unpaidRule: UnpaidStartRule,
  ): Promise<{ debts: DebtsView; toCollect: CollectTotal }> {
    const [stored, rows, skips, currencies] = await Promise.all([
      chargeService.getOpenCharges({ branchFilter }),
      repositories().customer.findAllForStatus(branchFilter),
      skippedMonthService.getActiveSkips(),
      currencyService.getCurrencies(),
    ]);
    const customers = rows.map(mapDbCustomerToCustomer);
    const billsByLine = await this.getMonthBillsForLines(
      customers.flatMap((c) =>
        (c.customerPlans ?? []).filter((l) => l.active).map((l) => l.id),
      ),
    );
    return {
      debts: chargeService.buildDebtsView(stored),
      toCollect: collectTotal({
        customers,
        stored,
        billsByLine,
        skips,
        unpaidRule,
        currencies,
      }),
    };
  }

  getMonthBillsForLines(
    customerPlanIds: string[],
  ): Promise<Map<string, MonthBill[]>> {
    return chargeService.getMonthBillsForLines(customerPlanIds);
  }

  keyOf = keyOf;
}

export const ledgerService = new LedgerService();
