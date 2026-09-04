import type { ChargeKind, DashboardMetrics, UnpaidStartRule } from "@/src/core/types";
import type { BranchFilter } from "@/src/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { customerRepository as customerRepo } from "@/src/modules/customer/customers";
import { planRepository as planRepo } from "@/src/modules/admin/plans";
import { userRepository as userRepo } from "@/src/modules/admin/users";
import { collectionService, ledgerService } from "@/src/modules/ledger";
import saleService from "@/src/modules/transaction/sales/services/SaleService";
import expenseService from "@/src/modules/transaction/expenses/services/ExpenseService";
import walletService from "@/src/modules/wallet/services/WalletService";
import type { WalletActor } from "@/src/modules/wallet/utils/custody";


// One calendar month of collected cash, split by what it settled.
interface MonthCollections {
  subscription: number;
  sales: number;
  manual: number;
  total: number;
  paymentsCollectedCount: number;
  salesCount: number;
}

class DashboardService {
  private async getMonthCollections(
    year: number,
    month: number,
    branchFilter: BranchFilter,
  ): Promise<MonthCollections> {
    const start = new Date(year, month - 1, 1).toISOString();
    const endExclusive = new Date(year, month, 1).toISOString();
    const [rows, salesCount] = await Promise.all([
      collectionService.collectedInRange(start, endExclusive, branchFilter),
      saleService.countInRange(start, endExclusive, branchFilter),
    ]);
    // ONE pass: every row is a settled bill carrying its own kind, so the three
    // parts and the total come from the same numbers and cannot disagree.
    const usd = (r: { amount: number; ratePerUsdSnapshot: number }) =>
      r.amount / r.ratePerUsdSnapshot;
    const sumOf = (kind: ChargeKind) =>
      rows.filter((r) => r.stream === kind).reduce((s, r) => s + usd(r), 0);
    return {
      subscription: sumOf('month'),
      sales: sumOf('sale'),
      manual: sumOf('manual'),
      total: rows.reduce((s, r) => s + usd(r), 0),
      paymentsCollectedCount: new Set(rows.map((r) => r.collectionId)).size,
      salesCount,
    };
  }

  async getMetrics(
    branchFilter: BranchFilter = null,
    viewer: WalletActor | null = null,
    unpaidRule: UnpaidStartRule = "month_start",
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
      ledgerService.getDebtsView(branchFilter),
      customerRepo.countCreatedInRange(monthStart, monthEndExclusive, branchFilter),
      customerRepo.countCancelledInRange(monthStart, monthEndExclusive, branchFilter),
      this.getMonthCollections(year, month - 1, branchFilter),
      viewer ? walletService.getWalletsView(viewer, branchFilter) : Promise.resolve([]),
      viewer
        ? expenseService.getTotalsInRange(monthStart, monthEndExclusive, branchFilter)
        : Promise.resolve({ totalUsd: 0, customUsd: 0, stockUsd: 0 }),
    ]);

    const walletCash = wallets.reduce((sum, w) => sum + w.totalUsd, 0);
    const walletCollectors = wallets.length;
    const walletTransactions = wallets.reduce((sum, w) => sum + w.itemCount, 0);

    // Debt by kind, in USD. Every row carries its own balance, so unlike the old
    // gross-vs-net split these three ADD UP to totalDebt exactly.
    const debtOf = (kind: ChargeKind) =>
      debtsView.customers.reduce(
        (sum, c) =>
          sum +
          c.items
            .filter((i) => i.kind === kind)
            .reduce((s, i) => s + i.balance / i.ratePerUsdSnapshot, 0),
        0,
      );

    return {
      totalCustomers,
      activeCustomers,
      monthlyRevenue: collected.total,
      subscriptionRevenue: collected.subscription,
      salesRevenue: collected.sales,
      manualRevenue: collected.manual,
      monthlyExpenses: expenses.totalUsd,
      stockExpenses: expenses.stockUsd,
      customExpenses: expenses.customUsd,
      netIncome: collected.total - expenses.totalUsd,
      unpaidThisMonth: monthCounts.unpaid,
      dueThisMonth: monthCounts.due,
      totalUsers,
      totalPlans,
      totalDebt: debtsView.summary.totalUsd,
      monthsDebt: debtOf("month"),
      salesDebt: debtOf("sale"),
      manualDebt: debtOf("manual"),
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
