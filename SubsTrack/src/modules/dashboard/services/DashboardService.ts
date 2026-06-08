import type { DashboardMetrics } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import customerRepo from '@/src/modules/customers/repository/CustomerRepository';
import paymentRepo from '@/src/modules/customer-payments/repository/PaymentRepository';
import planRepo from '@/src/modules/plans/repository/PlanRepository';
import userRepo from '@/src/modules/users/repository/UserRepository';
import saleRepo from '@/src/modules/sales/repository/SaleRepository';

// Sums payment rows in USD using each row's frozen snapshot rate.
// monthlyRevenue and totalOutstandingBalance are canonical USD so the screen
// can re-format into the user's display currency at render.
function sumInUsd(rows: { amount: number; ratePerUsdSnapshot: number }[]): number {
  return rows.reduce((sum, r) => sum + r.amount / r.ratePerUsdSnapshot, 0);
}

class DashboardService {
  async getMetrics(branchFilter: BranchFilter = null): Promise<DashboardMetrics> {
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
    ] = await Promise.all([
      customerRepo.countAll(branchFilter),
      customerRepo.countActive(branchFilter),
      paymentRepo.paidAmountsForMonth(billingMonth, branchFilter),
      customerRepo.countUnpaidForMonth(billingMonth, branchFilter),
      userRepo.countAll(branchFilter),
      planRepo.countAll(branchFilter),
      paymentRepo.balancesForMonth(billingMonth, branchFilter),
      saleRepo.totalsForMonth(monthStart, monthEndExclusive, branchFilter),
    ]);

    const subscriptionRevenue = sumInUsd(paidRows);
    const salesRevenue = sumInUsd(saleRows);

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
    };
  }
}

export default new DashboardService()
