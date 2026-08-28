import type { ChargeKind, DashboardMetrics, UnpaidStartRule } from "@/src/core/types";
import type { BranchFilter } from "@/src/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { customerRepository as customerRepo } from "@/src/modules/customer/customers";
import { planRepository as planRepo } from "@/src/modules/admin/plans";
import { userRepository as userRepo } from "@/src/modules/admin/users";
import { collectionService, ledgerService } from "@/src/modules/ledger";
import saleService from "@/src/modules/transaction/sales/services/SaleService";
// Deep import (not the module barrel) — the barrel re-exports ExpensesPanel,
// which would drag the whole screen graph back into this service.
import expenseService from "@/src/modules/transaction/expenses/services/ExpenseService";
import walletService from "@/src/modules/wallet/services/WalletService";
import type { WalletActor } from "@/src/modules/wallet/utils/custody";

// Revenue on this dashboard is CASH COLLECTED, not billed — ONE read over
// `collections` by received_at. A partial payment contributes just its paid
// part; the remainder is a debt and enters revenue in the month it is
// collected, so nothing is counted twice and nothing collected is lost.
//
// The breakdown splits that SAME money by what each item PAID FOR
// (charges.kind), which is why the three parts now add up to the total exactly
// — the old three-stream version could not, because a payment against a sale
// debt landed in the "debt" bucket instead of "sales".
//
// Amounts are summed in USD via each row's frozen snapshot rate, and every
// figure stays canonical USD so the screen can re-format at render.

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
      // How many times cash was physically taken — hand-overs, not bills.
      paymentsCollectedCount: new Set(rows.map((r) => r.collectionId)).size,
      // A count of SALES, not of money — a pay-later sale still happened.
      salesCount,
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
