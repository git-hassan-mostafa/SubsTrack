import type { BranchFilter } from '@/src/core/constants';
import type { CashRow, ExpenseItem, UnpaidStartRule } from '@/src/core/types';
import { groupByCurrency, sumUsd } from '@/src/core/utils/currency';
import { previousPeriod, toRange } from '@/src/core/utils/dateRange';
// Deep imports, not the module barrels — every barrel re-exports its screens,
// which would drag the whole UI graph into a service (the DashboardService
// precedent).
import customerRepo from '@/src/modules/customer/customers/repository/CustomerRepository';
import { mapDbCustomerToCustomer } from '@/src/modules/customer/customers/utils/mapper';
import paymentRepo from '@/src/modules/customer/customer-payments/repository/PaymentRepository';
import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import saleRepo from '@/src/modules/transaction/sales/repository/SaleRepository';
import debtRepo from '@/src/modules/transaction/debts/repository/DebtRepository';
import debtService from '@/src/modules/transaction/debts/services/DebtService';
import { groupDebtors } from '@/src/modules/transaction/debts/utils/debtAggregations';
import expenseService from '@/src/modules/transaction/expenses/services/ExpenseService';
import { sumByKey, sumUsdOf, topN } from '../utils/aggregate';
import type {
  AgingRow,
  DebtsReport,
  MoneyReport,
  ReportsFilter,
} from '../utils/types';

// USD of any row that carries a frozen rate — the ONE conversion rule, applied
// to cash and expenses alike.
const usdOf = (r: { amount: number; ratePerUsdSnapshot: number }) => r.amount / r.ratePerUsdSnapshot;

/**
 * Composes the reports from services and repositories that already exist. Two
 * rules hold everything together:
 *
 *  1. Revenue is CASH COLLECTED, never billed value — the same rule the
 *     dashboard follows, so the two must reconcile to the cent for one month.
 *  2. One query per stream per window, bucketed client-side. A 12-month report
 *     costs the same number of round trips as a 1-month one.
 */
class ReportsService {
  // The three cash streams for a window, already tagged and merged. Every money
  // figure in the app's reports comes from this one array.
  private async getCashRows(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    const [subs, sales, debts] = await Promise.all([
      paymentRepo.collectedInRange(startIso, endExclusiveIso, branchFilter),
      saleRepo.collectedInRange(startIso, endExclusiveIso, branchFilter),
      debtRepo.collectedInRange(startIso, endExclusiveIso, branchFilter),
    ]);
    return [
      ...subs.map((r): CashRow => ({ ...r, stream: 'subscription' })),
      ...sales.map((r): CashRow => ({ ...r, stream: 'sale' })),
      ...debts.map((r): CashRow => ({ ...r, stream: 'debt' })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }

  // Comparison window: totals only, so it uses the LEAN dashboard projections
  // rather than a second full CollectedRow fetch.
  private async getPrevTotals(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<{ collectedUsd: number; debtUsd: number }> {
    const [subs, sales, debts] = await Promise.all([
      paymentRepo.paidAmountsForMonth(startIso, endExclusiveIso, branchFilter),
      saleRepo.totalsForMonth(startIso, endExclusiveIso, branchFilter),
      debtRepo.paidAmountsInRange(startIso, endExclusiveIso, branchFilter),
    ]);
    const debtUsd = sumUsd(debts);
    return { collectedUsd: sumUsd(subs) + sumUsd(sales) + debtUsd, debtUsd };
  }

  async getMoneyReport(filter: ReportsFilter): Promise<MoneyReport> {
    const { branchFilter } = filter;
    const range = toRange(filter.period);
    const prev = toRange(previousPeriod(filter.period));

    const [cash, expensesView, prevTotals, prevExpenses] = await Promise.all([
      this.getCashRows(range.startIso, range.endExclusiveIso, branchFilter),
      expenseService.getExpensesView({ ...range, branchFilter }),
      this.getPrevTotals(prev.startIso, prev.endExclusiveIso, branchFilter),
      expenseService.getTotalsInRange(prev.startIso, prev.endExclusiveIso, branchFilter),
    ]);

    const expenses: ExpenseItem[] = expensesView.items;
    const collectedUsd = sumUsdOf(cash, usdOf);
    const spentUsd = expensesView.summary.totalUsd;

    return {
      cash,
      expenses,
      collectedUsd,
      spentUsd,
      netUsd: collectedUsd - spentUsd,
      prevCollectedUsd: prevTotals.collectedUsd,
      prevSpentUsd: prevExpenses.totalUsd,
      prevNetUsd: prevTotals.collectedUsd - prevExpenses.totalUsd,
      streamEntries: sumByKey(cash, (r) => r.stream, usdOf),
      categoryEntries: sumByKey(expenses, (r) => r.category, usdOf),
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

    // The whole customer base, not the list's first page — ageing that stops at
    // 50 customers is worse than no ageing at all.
    const customers = (await customerRepo.findAllForStatus(branchFilter)).map(
      mapDbCustomerToCustomer,
    );

    const [view, collectedRows, prevTotals, overdueCounts] = await Promise.all([
      // No date scope — outstanding debt is all-time by design.
      debtService.getDebtsView({ branchFilter }),
      debtRepo.collectedInRange(range.startIso, range.endExclusiveIso, branchFilter),
      this.getPrevTotals(prev.startIso, prev.endExclusiveIso, branchFilter),
      paymentService.getOverdueMonthCounts(customers, unpaidRule),
    ]);

    const collected: CashRow[] = collectedRows.map((r) => ({ ...r, stream: 'debt' }));
    const debtors = groupDebtors(view.items, view.payments);

    const byId = new Map(customers.map((c) => [c.id, c]));
    const aging: AgingRow[] = [...overdueCounts.entries()]
      .map(([customerId, months]) => ({
        customerId,
        customerName: byId.get(customerId)?.name ?? '',
        months,
      }))
      .sort((a, b) => b.months - a.months || a.customerName.localeCompare(b.customerName));

    return {
      outstandingUsd: view.summary.netUsd,
      grossUsd: view.summary.grossUsd,
      debtorCount: debtors.length,
      topDebtors: debtors.slice(0, 10),
      // Gross by category — these do NOT sum to the net outstanding above, the
      // same deliberate mismatch the dashboard debt tile shows.
      categoryEntries: topN(
        sumByKey(view.items, (i) => i.category, (i) => i.remaining / i.ratePerUsdSnapshot),
        6,
      ),
      collected,
      collectedUsd: sumUsdOf(collected, usdOf),
      prevCollectedUsd: prevTotals.debtUsd,
      aging,
    };
  }
}

export default new ReportsService();
