import type { DashboardMetrics, RevenuePoint } from "@/src/core/types";
import type { BranchFilter } from "@/src/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { customerRepository as customerRepo } from "@/src/modules/customers";
import { paymentRepository as paymentRepo } from "@/src/modules/customer-payments";
import { planRepository as planRepo } from "@/src/modules/plans";
import { userRepository as userRepo } from "@/src/modules/users";
import { saleRepository as saleRepo } from "@/src/modules/sales";

// The revenue trend spans last 6 months.
const MONTHS_IN_YEAR = 6;

// Sums payment rows in USD using each row's frozen snapshot rate.
// monthlyRevenue and totalOutstandingBalance are canonical USD so the screen
// can re-format into the user's display currency at render.
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
    // Payments key off paid_at, sales off sold_at — both are ISO timestamps.
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

    const [trendPaidRows, trendSaleRows] = await Promise.all([
      paymentRepo.paidAmountsInRange(trendStartIso, trendEndIso, branchFilter),
      saleRepo.totalsInRange(trendStartIso, trendEndIso, branchFilter),
    ]);

    // Bucket the trend rows by month into canonical USD.
    const buckets = new Map<string, { subscription: number; sales: number }>();
    for (const p of trendPoints)
      buckets.set(monthKey(p.year, p.month), { subscription: 0, sales: 0 });
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
    return trendPoints.map((p) => {
      const b = buckets.get(monthKey(p.year, p.month))!;
      return {
        month: monthKey(p.year, p.month),
        monthIndex: p.month - 1,
        year: p.year,
        subscription: b.subscription,
        sales: b.sales,
        total: b.subscription + b.sales,
      };
    });
  }

  async getMetrics(
    branchFilter: BranchFilter = null,
  ): Promise<DashboardMetrics> {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEndExclusive = new Date(year, month, 1).toISOString();

    const [
      totalCustomers,
      activeCustomers,
      paidRows,
      unpaidThisMonth,
      totalUsers,
      totalPlans,
      balanceRows,
      saleRows,
      newCustomersThisMonth,
      cancelledThisMonth,
      revenueTrend,
    ] = await Promise.all([
      customerRepo.countAll(branchFilter),
      customerRepo.countActive(branchFilter),
      paymentRepo.paidAmountsForMonth(monthStart, monthEndExclusive, branchFilter),
      customerRepo.countUnpaidForMonth(billingMonth, branchFilter),
      userRepo.countAll(branchFilter),
      planRepo.countAll(branchFilter),
      paymentRepo.balancesForMonth(billingMonth, branchFilter),
      saleRepo.totalsForMonth(monthStart, monthEndExclusive, branchFilter),
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
    ]);

    const subscriptionRevenue = sumInUsd(paidRows);
    const salesRevenue = sumInUsd(saleRows);

    // Previous calendar month's total, for the hero card's month-over-month delta.
    // The trend spans the 6 months ending on the current month, so the previous
    // month is always its second-to-last point.
    const prevPoint = revenueTrend[revenueTrend.length - 2];
    const prevMonthRevenue = prevPoint ? prevPoint.total : 0;

    return {
      totalCustomers,
      activeCustomers,
      monthlyRevenue: subscriptionRevenue + salesRevenue,
      subscriptionRevenue,
      salesRevenue,
      unpaidThisMonth,
      totalUsers,
      totalPlans,
      totalOutstandingBalance: sumInUsd(balanceRows),
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
