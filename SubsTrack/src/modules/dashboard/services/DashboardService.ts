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
  async getMetrics(
    branchFilter: BranchFilter = null,
  ): Promise<DashboardMetrics> {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEndExclusive = new Date(year, month, 1).toISOString();

    // Current-year window: Jan → Dec of the current year. Payments key off
    // billing_month, sales off sold_at, so we bound each in its own units.
    const trendPoints = Array.from({ length: MONTHS_IN_YEAR }, (_, i) => ({
      year,
      month: month - MONTHS_IN_YEAR + i + 1,
    }));
    const trendStartBilling = toBillingMonth(
      trendPoints[0].year,
      trendPoints[0].month,
    );
    const trendEndBilling = toBillingMonth(
      trendPoints[MONTHS_IN_YEAR - 1].year,
      trendPoints[MONTHS_IN_YEAR - 1].month,
    );
    const trendStartIso = new Date(year, 0, 1).toISOString();
    const trendEndIso = new Date(year + 1, 0, 1).toISOString();

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
      trendPaidRows,
      trendSaleRows,
    ] = await Promise.all([
      customerRepo.countAll(branchFilter),
      customerRepo.countActive(branchFilter),
      paymentRepo.paidAmountsForMonth(billingMonth, branchFilter),
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
      paymentRepo.paidAmountsInRange(
        trendStartBilling,
        trendEndBilling,
        branchFilter,
      ),
      saleRepo.totalsInRange(trendStartIso, trendEndIso, branchFilter),
    ]);

    const subscriptionRevenue = sumInUsd(paidRows);
    const salesRevenue = sumInUsd(saleRows);

    // Bucket the trend rows by month into canonical USD.
    const buckets = new Map<string, { subscription: number; sales: number }>();
    for (const p of trendPoints)
      buckets.set(monthKey(p.year, p.month), { subscription: 0, sales: 0 });
    for (const r of trendPaidRows) {
      const b = buckets.get(r.billingMonth.slice(0, 7));
      if (b) b.subscription += r.amount / r.ratePerUsdSnapshot;
    }
    for (const r of trendSaleRows) {
      const d = new Date(r.soldAt);
      const b = buckets.get(monthKey(d.getFullYear(), d.getMonth() + 1));
      if (b) b.sales += r.amount / r.ratePerUsdSnapshot;
    }
    const revenueTrend: RevenuePoint[] = trendPoints.map((p) => {
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
    // Previous calendar month's total, for the hero card's month-over-month delta.
    // The trend now spans Jan→Dec, so look it up by key rather than by position;
    // in January the prior month falls in last year (absent) and is treated as 0.
    const prev = new Date(year, month - 2, 1);
    const prevBucket = buckets.get(
      monthKey(prev.getFullYear(), prev.getMonth() + 1),
    );
    const prevMonthRevenue = prevBucket
      ? prevBucket.subscription + prevBucket.sales
      : 0;

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
