import type { BranchFilter } from '@/src/core/constants';
import type { CashRow, ExpenseItem, UnpaidStartRule } from '@/src/core/types';
import { groupByCurrency } from '@/src/core/utils/currency';
import { previousPeriod, toRange } from '@/src/core/utils/dateRange';
import customerRepo from '@/src/modules/customer/customers/repository/CustomerRepository';
import { mapDbCustomerToCustomer } from '@/src/modules/customer/customers/utils/mapper';
import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import { chargeService } from '@/src/modules/ledger/services/ChargeService';
import { collectionService } from '@/src/modules/ledger/services/CollectionService';
import { ledgerService } from '@/src/modules/ledger/services/LedgerService';
import { skippedMonthService } from '@/src/modules/customer/customer-payments';
import expenseService from '@/src/modules/transaction/expenses/services/ExpenseService';
import { sumByKey, sumUsdOf, topN } from '../utils/aggregate';
import type { AgingRow, DebtsReport, MoneyReport, ReportsFilter } from '../utils/types';

// USD of any row that carries a frozen rate — the ONE conversion rule, applied
// to cash and expenses alike.
const usdOf = (r: { amount: number; ratePerUsdSnapshot: number }) => r.amount / r.ratePerUsdSnapshot;

/**
 * Composes the reports from services that already exist. Three rules hold
 * everything together:
 *
 *  1. Revenue is CASH COLLECTED, never billed value — the same rule the
 *     dashboard follows, so the two must reconcile to the cent for one month.
 *  2. ONE query per window, bucketed client-side. A 12-month report costs the
 *     same number of round trips as a 1-month one, and every drill-down is a
 *     filter over rows already in memory — which is what makes the records add
 *     up to exactly the number that was tapped.
 *  3. Nothing here re-implements a rule: ageing is PaymentService's, money out
 *     is ExpenseService's, and the debts view is the Debts screen's.
 */
class ReportsService {
  private getCashRows(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    return collectionService.collectedInRange(startIso, endExclusiveIso, branchFilter);
  }

  async getMoneyReport(filter: ReportsFilter): Promise<MoneyReport> {
    const { branchFilter } = filter;
    const range = toRange(filter.period);
    const prev = toRange(previousPeriod(filter.period));

    const [cash, expensesView, prevCash, prevExpenses] = await Promise.all([
      this.getCashRows(range.startIso, range.endExclusiveIso, branchFilter),
      expenseService.getExpensesView({ ...range, branchFilter }),
      this.getCashRows(prev.startIso, prev.endExclusiveIso, branchFilter),
      expenseService.getTotalsInRange(prev.startIso, prev.endExclusiveIso, branchFilter),
    ]);

    const expenses: ExpenseItem[] = expensesView.items;
    const collectedUsd = sumUsdOf(cash, usdOf);
    const spentUsd = expensesView.summary.totalUsd;
    const prevCollectedUsd = sumUsdOf(prevCash, usdOf);

    return {
      cash,
      expenses,
      collectedUsd,
      spentUsd,
      netUsd: collectedUsd - spentUsd,
      prevCollectedUsd,
      prevSpentUsd: prevExpenses.totalUsd,
      prevNetUsd: prevCollectedUsd - prevExpenses.totalUsd,
      streamEntries: sumByKey(cash, (r) => r.stream, usdOf),
      categoryEntries: sumByKey(expenses, (r) => r.category, usdOf),
      byCurrency: groupByCurrency(cash),
    };
  }

  async getDebtsReport(filter: ReportsFilter, unpaidRule: UnpaidStartRule): Promise<DebtsReport> {
    const { branchFilter } = filter;
    const range = toRange(filter.period);
    const prev = toRange(previousPeriod(filter.period));

    // The whole customer base, not the list's first page — ageing that stops at
    // 50 customers is worse than no ageing at all.
    const customers = (await customerRepo.findAllForStatus(branchFilter)).map(
      mapDbCustomerToCustomer,
    );

    const lineIds = customers.flatMap((c) => (c.customerPlans ?? []).map((l) => l.id));
    const [view, cash, prevCash, writtenOffUsd, billsByLine, skips] = await Promise.all([
      ledgerService.getDebtsView(branchFilter),
      this.getCashRows(range.startIso, range.endExclusiveIso, branchFilter),
      this.getCashRows(prev.startIso, prev.endExclusiveIso, branchFilter),
      chargeService.writtenOffUsdInRange(range.startIso, range.endExclusiveIso, branchFilter),
      chargeService.getMonthBillsForLines(lineIds),
      skippedMonthService.getActiveSkips(),
    ]);

    const collected = cash.filter((r) => r.stream !== 'month');
    const prevCollected = prevCash.filter((r) => r.stream !== 'month');

    const overdueCounts = paymentService.getOverdueMonthCounts(
      customers,
      [...billsByLine.values()].flat(),
      skips,
      unpaidRule,
    );

    const byId = new Map(customers.map((c) => [c.id, c]));
    const aging: AgingRow[] = [...overdueCounts.entries()]
      .map(([customerId, months]) => ({
        customerId,
        customerName: byId.get(customerId)?.name ?? '',
        months,
      }))
      .sort((a, b) => b.months - a.months || a.customerName.localeCompare(b.customerName));

    return {
      outstandingUsd: view.summary.totalUsd,
      writtenOffUsd,
      debtorCount: view.summary.customerCount,
      topDebtors: view.customers.slice(0, 10),
      categoryEntries: topN(
        sumByKey(
          view.customers.flatMap((c) => c.items),
          (i) => i.kind,
          (i) => i.balance / i.ratePerUsdSnapshot,
        ),
        6,
      ),
      collected,
      collectedUsd: sumUsdOf(collected, usdOf),
      prevCollectedUsd: sumUsdOf(prevCollected, usdOf),
      aging,
    };
  }
}

export default new ReportsService();
