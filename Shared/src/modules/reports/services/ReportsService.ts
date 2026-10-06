import { repositories } from "@shared/core/runtime/repositories";
import type { BranchFilter } from "@shared/core/constants";
import type { CashRow, ExpenseItem, UnpaidStartRule } from "@shared/core/types";
import { groupByCurrency, snapshotUsd } from "@shared/core/utils/currency";
import { previousPeriod, toRange } from "@shared/core/utils/dateRange";
import { mapDbCustomerToCustomer } from "@shared/modules/customer/customers/utils/mapper";
import {
  getOverdueMonthCounts,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import { balanceUsd } from "@shared/modules/ledger/utils/debtRule";
import skippedMonthService from "@shared/modules/customer/customer-payments/services/SkippedMonthService";
import expenseService from "@shared/modules/transaction/expenses/services/ExpenseService";
import saleService from "@shared/modules/transaction/sales/services/SaleService";
import { sumByKey, sumUsdOf, topN } from "@shared/modules/reports/utils/aggregate";
import type {
  AgingRow,
  CustomersReport,
  DebtsReport,
  MoneyReport,
  ReportsFilter,
  SalesReport,
} from "@shared/modules/reports/utils/types";

// One read per window, bucketed in memory; no rule re-implemented — gotchas #91, #92.
class ReportsService {
  private getCashRows(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    return collectionService.collectedInRange(
      startIso,
      endExclusiveIso,
      branchFilter,
    );
  }

  async getMoneyReport(filter: ReportsFilter): Promise<MoneyReport> {
    const { branchFilter } = filter;
    const range = toRange(filter.period);
    const prev = toRange(previousPeriod(filter.period));

    const [cash, expensesView, prevCash, prevExpensesView] = await Promise.all([
      this.getCashRows(range.startIso, range.endExclusiveIso, branchFilter),
      expenseService.getExpensesView({ ...range, branchFilter }),
      this.getCashRows(prev.startIso, prev.endExclusiveIso, branchFilter),
      expenseService.getExpensesView({ ...prev, branchFilter }),
    ]);

    const expenses: ExpenseItem[] = expensesView.items;
    const collectedUsd = sumUsdOf(cash, snapshotUsd);
    const spentUsd = expensesView.summary.totalUsd;
    const prevCollectedUsd = sumUsdOf(prevCash, snapshotUsd);
    const prevSpentUsd = prevExpensesView.summary.totalUsd;

    return {
      cash,
      expenses,
      prevCash,
      prevExpenses: prevExpensesView.items,
      collectedUsd,
      spentUsd,
      netUsd: collectedUsd - spentUsd,
      prevCollectedUsd,
      prevSpentUsd,
      prevNetUsd: prevCollectedUsd - prevSpentUsd,
      streamEntries: sumByKey(cash, (r) => r.stream, snapshotUsd),
      categoryEntries: sumByKey(expenses, (r) => r.category, snapshotUsd),
      byCurrency: groupByCurrency(cash),
    };
  }

  async getDebtsReport(
    filter: ReportsFilter,
    unpaidRule: UnpaidStartRule,
  ): Promise<DebtsReport> {
    const { branchFilter } = filter;
    const range = toRange(filter.period);
    const prev = toRange(previousPeriod(filter.period));

    const customers = (await repositories().customer.findAllForStatus(branchFilter)).map(
      mapDbCustomerToCustomer,
    );

    const lineIds = customers.flatMap((c) =>
      (c.customerPlans ?? []).map((l) => l.id),
    );
    const [view, cash, prevCash, writtenOffUsd, billsByLine, skips] =
      await Promise.all([
        ledgerService.getDebtsView(branchFilter),
        this.getCashRows(range.startIso, range.endExclusiveIso, branchFilter),
        this.getCashRows(prev.startIso, prev.endExclusiveIso, branchFilter),
        chargeService.writtenOffUsdInRange(
          range.startIso,
          range.endExclusiveIso,
          branchFilter,
        ),
        chargeService.getMonthBillsForLines(lineIds),
        skippedMonthService.getActiveSkips(),
      ]);

    const collected = cash.filter((r) => r.stream !== "month");
    const prevCollected = prevCash.filter((r) => r.stream !== "month");

    const overdueCounts = getOverdueMonthCounts(
      customers,
      [...billsByLine.values()].flat(),
      skips,
      unpaidRule,
    );

    const byId = new Map(customers.map((c) => [c.id, c]));
    const aging: AgingRow[] = [...overdueCounts.entries()]
      .map(([customerId, months]) => ({
        customerId,
        customerName: byId.get(customerId)?.name ?? "",
        months,
      }))
      .sort(
        (a, b) =>
          b.months - a.months || a.customerName.localeCompare(b.customerName),
      );

    return {
      outstandingUsd: view.summary.totalUsd,
      writtenOffUsd,
      debtorCount: view.summary.customerCount,
      debtors: view.customers,
      topDebtors: view.customers.slice(0, 10),
      categoryEntries: topN(
        sumByKey(
          view.customers.flatMap((c) => c.items),
          (i) => i.kind,
          (i) => balanceUsd(i.balance, i.ratePerUsdSnapshot),
        ),
        6,
      ),
      collected,
      collectedUsd: sumUsdOf(collected, snapshotUsd),
      prevCollectedUsd: sumUsdOf(prevCollected, snapshotUsd),
      aging,
    };
  }

  async getCustomersReport(filter: ReportsFilter): Promise<CustomersReport> {
    const rows = await repositories().customer.findEveryWithLines(
      filter.branchFilter,
    );
    return { customers: rows.map(mapDbCustomerToCustomer) };
  }

  async getSalesReport(filter: ReportsFilter): Promise<SalesReport> {
    const { branchFilter } = filter;
    const range = toRange(filter.period);
    const prev = toRange(previousPeriod(filter.period));
    const [sales, prevSales] = await Promise.all([
      saleService.getInRange(range.startIso, range.endExclusiveIso, branchFilter),
      saleService.getInRange(prev.startIso, prev.endExclusiveIso, branchFilter),
    ]);
    return { sales, prevSales };
  }
}

export default new ReportsService();
