import type {
  ChargeKind,
  DashboardMetrics,
  UnpaidStartRule,
} from "@shared/core/types";
import type { BranchFilter } from "@shared/core/constants";
import { repositories } from "@shared/core/runtime/repositories";
import { getCurrentYearMonth, toBillingMonth } from "@shared/core/utils/date";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import { owedUsd } from "@shared/modules/ledger/utils/debtRule";
import saleService from "@shared/modules/transaction/sales/services/SaleService";
import expenseService from "@shared/modules/transaction/expenses/services/ExpenseService";
import walletService from "@shared/modules/wallet/services/WalletService";
import type { WalletActor } from "@shared/modules/wallet/utils/custody";

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
      subscription: sumOf("month"),
      sales: sumOf("sale"),
      manual: sumOf("manual"),
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
      repositories().customer.countAll(branchFilter),
      repositories().customer.countActive(branchFilter),
      this.getMonthCollections(year, month, branchFilter),
      repositories().customer.countUnpaidForMonth(billingMonth, branchFilter, unpaidRule),
      repositories().user.countAll(branchFilter),
      repositories().plan.countAll(branchFilter),
      ledgerService.getDebtsView(branchFilter),
      repositories().customer.countCreatedInRange(
        monthStart,
        monthEndExclusive,
        branchFilter,
      ),
      repositories().customer.countCancelledInRange(
        monthStart,
        monthEndExclusive,
        branchFilter,
      ),
      this.getMonthCollections(year, month - 1, branchFilter),
      viewer
        ? walletService.getWalletsView(viewer, branchFilter)
        : Promise.resolve([]),
      viewer
        ? expenseService.getTotalsInRange(
            monthStart,
            monthEndExclusive,
            branchFilter,
          )
        : Promise.resolve({ totalUsd: 0, customUsd: 0, stockUsd: 0 }),
    ]);

    const walletCash = wallets.reduce((sum, w) => sum + w.totalUsd, 0);
    const walletCollectors = wallets.length;
    const walletTransactions = wallets.reduce((sum, w) => sum + w.itemCount, 0);

    const debtOf = (kind: ChargeKind) =>
      debtsView.customers.reduce(
        (sum, c) => sum + owedUsd(c.items.filter((i) => i.kind === kind)),
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
