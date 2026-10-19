import type { BranchFilter } from "@shared/core/constants";
import type {
  Currency,
  Customer,
  CustomerPlan,
  DebtsView,
  LineUsage,
  MonthBill,
  OpenItem,
  PriceHistory,
  SkippedMonth,
  UnpaidStartRule,
} from "@shared/core/types";
import { repositories } from "@shared/core/runtime/repositories";
import { mapDbCustomerToCustomer } from "@shared/modules/customer/customers/utils/mapper";
import skippedMonthService from "@shared/modules/customer/customer-payments/services/SkippedMonthService";
import currencyService from "@shared/modules/admin/currencies/services/CurrencyService";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import { usageReadingService } from "@shared/modules/customer/customer-payments/services/UsageReadingService";
import { usageByLineOf } from "@shared/modules/customer/customer-payments/utils/usageBill";
import { chargeService } from "./ChargeService";
import { mergeOwed } from "../utils/mergeOwed";
import {
  collectTotal,
  owedItems,
  type CollectTotal,
  type CollectTotalArgs,
} from "../utils/collectTotal";
import { buildOwedView } from "../utils/owedView";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import { groupBy } from "@shared/core/utils/groupBy";
import { inChunks } from "@shared/core/utils/chunk";

const OWED_BATCH_SIZE = 100;

// The one answer to "what does this customer owe?" — stored bills + virtual months.
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
    const [open, billsByLine, prices] = await Promise.all([
      chargeService.getOpenCharges({ customerId: customer.id }),
      active.length > 0
        ? chargeService.getMonthBillsForLines(active.map((l) => l.id))
        : Promise.resolve(new Map<string, MonthBill[]>()),
      priceHistoryService.getForLines(active),
    ]);
    const usageByLine = await this.usageFor(active, prices);
    return mergeOwed({ ...args, stored: open, billsByLine, prices, usageByLine });
  }

  // One customer's To collect: inactive or occasional owe debts only — gotcha #184.
  async getToCollect(args: {
    customer: Customer;
    skips: SkippedMonth[];
    unpaidRule: UnpaidStartRule;
    currencies: Currency[];
  }): Promise<OpenItem[]> {
    const { customer } = args;
    if (customer.active && customer.isRegular) {
      return this.getOwed({ ...args, lines: customer.customerPlans ?? [] });
    }
    const open = await chargeService.getOpenCharges({ customerId: customer.id });
    return open
      .filter((item) => item.isDebt)
      .map((item) => ({ ...item, customerName: customer.name }));
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
      const lines = chunk.flatMap((c) =>
        (c.customerPlans ?? []).filter((l) => l.active),
      );
      const lineIds = lines.map((l) => l.id);
      const [open, billsByLine, prices] = await Promise.all([
        chargeService.getOpenCharges({ customerIds: chunk.map((c) => c.id) }),
        lineIds.length > 0
          ? chargeService.getMonthBillsForLines(lineIds)
          : Promise.resolve(new Map<string, MonthBill[]>()),
        priceHistoryService.getForLines(lines),
      ]);
      const usageByLine = await this.usageFor(lines, prices);
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
            prices,
            usageByLine,
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

  // The To collect page: the same items the dashboard's Total to collect sums.
  async getOwedView(
    branchFilter: BranchFilter,
    unpaidRule: UnpaidStartRule,
  ): Promise<DebtsView> {
    return buildOwedView(owedItems(await this.readOwed(branchFilter, unpaidRule)));
  }

  // Debts and Total to collect from one read of the open bills — gotcha #184.
  async getOwedTotals(
    branchFilter: BranchFilter,
    unpaidRule: UnpaidStartRule,
  ): Promise<{ debts: DebtsView; toCollect: CollectTotal }> {
    const owed = await this.readOwed(branchFilter, unpaidRule);
    return {
      debts: chargeService.buildDebtsView(owed.stored),
      toCollect: collectTotal(owed),
    };
  }

  private async readOwed(
    branchFilter: BranchFilter,
    unpaidRule: UnpaidStartRule,
  ): Promise<CollectTotalArgs> {
    const [stored, rows, skips, currencies] = await Promise.all([
      chargeService.getOpenCharges({ branchFilter }),
      repositories().customer.findAllForStatus(branchFilter),
      skippedMonthService.getActiveSkips(),
      currencyService.getCurrencies(),
    ]);
    const customers = rows.map(mapDbCustomerToCustomer);
    const lines = customers.flatMap((c) =>
      (c.customerPlans ?? []).filter((l) => l.active),
    );
    const [billsByLine, prices] = await Promise.all([
      this.getMonthBillsForLines(lines.map((l) => l.id)),
      priceHistoryService.getForLines(lines),
    ]);
    const usageByLine = await this.usageFor(lines, prices);
    return {
      customers,
      stored,
      billsByLine,
      prices,
      usageByLine,
      skips,
      unpaidRule,
      currencies,
    };
  }

  private async usageFor(
    lines: CustomerPlan[],
    prices: PriceHistory,
  ): Promise<Map<string, LineUsage>> {
    const usageLines = lines.filter((l) => l.plan?.usage);
    if (usageLines.length === 0) return new Map();
    const readings = await usageReadingService.getForLines(usageLines.map((l) => l.id));
    return usageByLineOf(usageLines, readings, prices);
  }

  getMonthBillsForLines(
    customerPlanIds: string[],
  ): Promise<Map<string, MonthBill[]>> {
    return chargeService.getMonthBillsForLines(customerPlanIds);
  }

  keyOf = keyOf;
}

export const ledgerService = new LedgerService();
