import type {
  DashboardMetrics,
  DebtCategory,
  RevenuePoint,
  UnpaidStartRule,
} from "@/src/core/types";
import type { BranchFilter } from "@/src/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { customerRepository as customerRepo } from "@/src/modules/customer/customers";
import { paymentRepository as paymentRepo } from "@/src/modules/customer/customer-payments";
import { planRepository as planRepo } from "@/src/modules/admin/plans";
import { userRepository as userRepo } from "@/src/modules/admin/users";
import { saleRepository as saleRepo } from "@/src/modules/transaction/sales";
import { debtRepository as debtRepo, debtService } from "@/src/modules/transaction/debts";
import walletService from "@/src/modules/wallet/services/WalletService";
import type { WalletActor } from "@/src/modules/wallet/utils/custody";

// The revenue trend spans last 6 months.
const MONTHS_IN_YEAR = 6;

// Revenue on this dashboard is CASH COLLECTED, not billed. All three streams
// (subscription payments, sales, debt payments) sum only what was received, so
// a partial payment or partial sale contributes just its paid part and the
// remainder shows up later, in the month its debt is collected.
//
// Sums money rows in USD using each row's frozen snapshot rate.
// monthlyRevenue and totalDebt are canonical USD so the screen can
// re-format into the user's display currency at render.
function sumInUsd(
  rows: { amount: number; ratePerUsdSnapshot: number }[],
): number {
  return rows.reduce((sum, r) => sum + r.amount / r.ratePerUsdSnapshot, 0);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

class DashboardService {
  // 6 months ending at (anchorYear, anchorMonth) inclusive. Used both for the
  // initial dashboard load (anchored on the current month) and for navigating
  // the revenue chart to earlier/later windows.
  async getRevenueTrend(
    anchorYear: number,
    anchorMonth: number,
    branchFilter: BranchFilter = null,
  ): Promise<RevenuePoint[]> {
    // Build each point from an absolute month index so year rollovers (e.g.
    // anchoring on Jan/Feb/.../Jun, where month - MONTHS_IN_YEAR + i + 1 goes
    // <= 0) normalize into the correct prior year instead of leaving an
    // invalid month number paired with the anchor's year.
    const trendPoints = Array.from({ length: MONTHS_IN_YEAR }, (_, i) => {
      const absoluteMonth = anchorYear * 12 + (anchorMonth - 1) - MONTHS_IN_YEAR + i + 1;
      return {
        year: Math.floor(absoluteMonth / 12),
        month: (((absoluteMonth % 12) + 12) % 12) + 1,
      };
    });
    // Payments and debt payments key off paid_at, sales off sold_at — all ISO.
    const trendStartIso = new Date(
      trendPoints[0].year,
      trendPoints[0].month - 1,
      1,
    ).toISOString();
    const trendEndIso = new Date(
      trendPoints[MONTHS_IN_YEAR - 1].year,
      trendPoints[MONTHS_IN_YEAR - 1].month,
      1,
    ).toISOString();

    const [trendPaidRows, trendSaleRows, trendDebtRows] = await Promise.all([
      paymentRepo.paidAmountsInRange(trendStartIso, trendEndIso, branchFilter),
      saleRepo.totalsInRange(trendStartIso, trendEndIso, branchFilter),
      debtRepo.paidAmountsInRange(trendStartIso, trendEndIso, branchFilter),
    ]);

    // Bucket the trend rows by month into canonical USD.
    const buckets = new Map<
      string,
      { subscription: number; sales: number; debt: number }
    >();
    for (const p of trendPoints)
      buckets.set(monthKey(p.year, p.month), { subscription: 0, sales: 0, debt: 0 });
    for (const r of trendPaidRows) {
      const d = new Date(r.paidAt);
      const b = buckets.get(monthKey(d.getFullYear(), d.getMonth() + 1));
      if (b) b.subscription += r.amount / r.ratePerUsdSnapshot;
    }
    for (const r of trendSaleRows) {
      const d = new Date(r.soldAt);
      const b = buckets.get(monthKey(d.getFullYear(), d.getMonth() + 1));
      if (b) b.sales += r.amount / r.ratePerUsdSnapshot;
    }
    for (const r of trendDebtRows) {
      const d = new Date(r.paidAt);
      const b = buckets.get(monthKey(d.getFullYear(), d.getMonth() + 1));
      if (b) b.debt += r.amount / r.ratePerUsdSnapshot;
    }
    return trendPoints.map((p) => {
      const b = buckets.get(monthKey(p.year, p.month))!;
      return {
        month: monthKey(p.year, p.month),
        monthIndex: p.month - 1,
        year: p.year,
        subscription: b.subscription,
        sales: b.sales,
        debt: b.debt,
        total: b.subscription + b.sales + b.debt,
      };
    });
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
      paidRows,
      monthCounts,
      totalUsers,
      totalPlans,
      debtsView,
      saleRows,
      debtPaidRows,
      newCustomersThisMonth,
      cancelledThisMonth,
      revenueTrend,
      wallets,
    ] = await Promise.all([
      customerRepo.countAll(branchFilter),
      customerRepo.countActive(branchFilter),
      paymentRepo.paidAmountsForMonth(monthStart, monthEndExclusive, branchFilter),
      customerRepo.countUnpaidForMonth(billingMonth, branchFilter, unpaidRule),
      userRepo.countAll(branchFilter),
      planRepo.countAll(branchFilter),
      debtService.getDebtsView({ branchFilter }),
      saleRepo.totalsForMonth(monthStart, monthEndExclusive, branchFilter),
      debtRepo.paidAmountsInRange(monthStart, monthEndExclusive, branchFilter),
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
      this.getRevenueTrend(year, month, branchFilter),
      viewer ? walletService.getWalletsView(viewer, branchFilter) : Promise.resolve([]),
    ]);

    const subscriptionRevenue = sumInUsd(paidRows);
    const salesRevenue = sumInUsd(saleRows);
    const debtRevenue = sumInUsd(debtPaidRows);

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
      sumInUsd(
        debtsView.items
          .filter((i) => i.category === category)
          .map((i) => ({ amount: i.remaining, ratePerUsdSnapshot: i.ratePerUsdSnapshot })),
      );

    // Previous calendar month's total, for the hero card's month-over-month delta.
    // The trend spans the 6 months ending on the current month, so the previous
    // month is always its second-to-last point.
    const prevPoint = revenueTrend[revenueTrend.length - 2];
    const prevMonthRevenue = prevPoint ? prevPoint.total : 0;

    return {
      totalCustomers,
      activeCustomers,
      monthlyRevenue: subscriptionRevenue + salesRevenue + debtRevenue,
      subscriptionRevenue,
      salesRevenue,
      debtRevenue,
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
      // paidRows carries one row per non-voided payment for the month; a 0 amount
      // is an unpaid slot, so real collections are the positive ones.
      paymentsCollectedCount: paidRows.filter((r) => r.amount > 0).length,
      salesCount: saleRows.length,
      prevMonthRevenue,
      revenueTrend,
    };
  }
}

export default new DashboardService();
