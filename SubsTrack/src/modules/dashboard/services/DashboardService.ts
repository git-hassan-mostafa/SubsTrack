import type {
  DashboardMetrics,
  DebtCategory,
  UnpaidStartRule,
} from "@/src/core/types";
import type { BranchFilter } from "@/src/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { sumUsd } from "@/src/core/utils/currency";
import { customerRepository as customerRepo } from "@/src/modules/customer/customers";
import { paymentRepository as paymentRepo } from "@/src/modules/customer/customer-payments";
import { planRepository as planRepo } from "@/src/modules/admin/plans";
import { userRepository as userRepo } from "@/src/modules/admin/users";
import { saleRepository as saleRepo } from "@/src/modules/transaction/sales";
import { debtRepository as debtRepo, debtService } from "@/src/modules/transaction/debts";
// Deep import (not the module barrel) — the barrel re-exports ExpensesPanel,
// which would drag the whole screen graph back into this service.
import expenseService from "@/src/modules/transaction/expenses/services/ExpenseService";
import walletService from "@/src/modules/wallet/services/WalletService";
import type { WalletActor } from "@/src/modules/wallet/utils/custody";

// Revenue on this dashboard is CASH COLLECTED, not billed. All three streams
// (subscription payments, sales, debt payments) sum only what was received, so
// a partial payment or partial sale contributes just its paid part and the
// remainder shows up later, in the month its debt is collected.
//
// Amounts are summed in USD via each row's frozen snapshot rate (sumUsd), and
// monthlyRevenue / totalDebt stay canonical USD so the screen can re-format
// into the user's display currency at render.

// One calendar month of collected cash, split by stream.
interface MonthCollections {
  subscription: number;
  sales: number;
  debt: number;
  total: number;
  paymentsCollectedCount: number;
  salesCount: number;
}

class DashboardService {
  // The ONE fetch behind every revenue figure: this month's breakdown and last
  // month's comparison total both come from here, so the two can never drift
  // apart. `month` may be 0 (or 13): Date normalizes it into the neighbouring
  // year, so January needs no special case.
  private async getMonthCollections(
    year: number,
    month: number,
    branchFilter: BranchFilter,
  ): Promise<MonthCollections> {
    const start = new Date(year, month - 1, 1).toISOString();
    const endExclusive = new Date(year, month, 1).toISOString();
    // Payments and debt payments key off paid_at, sales off sold_at — all ISO.
    const [paidRows, saleRows, debtRows] = await Promise.all([
      paymentRepo.paidAmountsForMonth(start, endExclusive, branchFilter),
      saleRepo.totalsForMonth(start, endExclusive, branchFilter),
      debtRepo.paidAmountsInRange(start, endExclusive, branchFilter),
    ]);
    const subscription = sumUsd(paidRows);
    const sales = sumUsd(saleRows);
    const debt = sumUsd(debtRows);
    return {
      subscription,
      sales,
      debt,
      total: subscription + sales + debt,
      // paidRows carries one row per non-voided payment for the month; a 0
      // amount is an unpaid slot, so real collections are the positive ones.
      paymentsCollectedCount: paidRows.filter((r) => r.amount > 0).length,
      salesCount: saleRows.length,
    };
  }

  async getMetrics(
    branchFilter: BranchFilter = null,
    // The collector-wallet aggregate is an admin overview. Skipped (viewer null)
    // for non-admins so their dashboard load stays lean and never surfaces the
    // cross-collector cash totals.
    viewer: WalletActor | null = null,
    // Decides whether a line whose billing day hasn't arrived counts as unpaid
    // this month — same rule the month grid and the customer badges use.
    unpaidRule: UnpaidStartRule = 'month_start',
  ): Promise<DashboardMetrics> {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEndExclusive = new Date(year, month, 1).toISOString();

    const [
      totalCustomers,
      activeCustomers,
      collected,
      monthCounts,
      totalUsers,
      totalPlans,
      debtsView,
      newCustomersThisMonth,
      cancelledThisMonth,
      prevMonth,
      wallets,
      expenses,
    ] = await Promise.all([
      customerRepo.countAll(branchFilter),
      customerRepo.countActive(branchFilter),
      this.getMonthCollections(year, month, branchFilter),
      customerRepo.countUnpaidForMonth(billingMonth, branchFilter, unpaidRule),
      userRepo.countAll(branchFilter),
      planRepo.countAll(branchFilter),
      debtService.getDebtsView({ branchFilter }),
      customerRepo.countCreatedInRange(
        monthStart,
        monthEndExclusive,
        branchFilter,
      ),
      customerRepo.countCancelledInRange(
        monthStart,
        monthEndExclusive,
        branchFilter,
      ),
      // Last month's total, for the hero card's vs-last-month pill.
      this.getMonthCollections(year, month - 1, branchFilter),
      viewer ? walletService.getWalletsView(viewer, branchFilter) : Promise.resolve([]),
      // Money out. Same admin gate as the wallet aggregate: `viewer` is non-null
      // only for admins, and expenses are admin-only end to end.
      viewer
        ? expenseService.getTotalsInRange(monthStart, monthEndExclusive, branchFilter)
        : Promise.resolve({ totalUsd: 0, customUsd: 0, stockUsd: 0 }),
    ]);

    // Collector wallets: net cash on hand anywhere in the chain (the viewer's
    // own wallet included), and who/how-many rows hold it.
    const walletCash = wallets.reduce((sum, w) => sum + w.totalUsd, 0);
    const walletCollectors = wallets.length;
    const walletTransactions = wallets.reduce((sum, w) => sum + w.itemCount, 0);

    // Debt breakdown by category, in USD. Debt payments aren't tied to a category
    // (see DebtService), so these are GROSS remaining balances while totalDebt
    // below is the net (gross − debt payments) — they don't add up to it, and the
    // 'custom' category isn't surfaced at all.
    const grossDebt = (category: DebtCategory) =>
      sumUsd(
        debtsView.items
          .filter((i) => i.category === category)
          .map((i) => ({ amount: i.remaining, ratePerUsdSnapshot: i.ratePerUsdSnapshot })),
      );

    return {
      totalCustomers,
      activeCustomers,
      monthlyRevenue: collected.total,
      subscriptionRevenue: collected.subscription,
      salesRevenue: collected.sales,
      debtRevenue: collected.debt,
      monthlyExpenses: expenses.totalUsd,
      stockExpenses: expenses.stockUsd,
      customExpenses: expenses.customUsd,
      netIncome: collected.total - expenses.totalUsd,
      unpaidThisMonth: monthCounts.unpaid,
      dueThisMonth: monthCounts.due,
      totalUsers,
      totalPlans,
      totalDebt: debtsView.summary.netUsd,
      monthsDebt: grossDebt("months"),
      salesDebt: grossDebt("sales"),
      walletCash,
      walletCollectors,
      walletTransactions,
      newCustomersThisMonth,
      cancelledThisMonth,
      paymentsCollectedCount: collected.paymentsCollectedCount,
      salesCount: collected.salesCount,
      prevMonthRevenue: prevMonth.total,
    };
  }
}

export default new DashboardService();
