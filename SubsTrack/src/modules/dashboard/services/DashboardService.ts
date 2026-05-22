import type { DashboardMetrics } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import { CustomerRepository } from '@/src/modules/customers/repository/CustomerRepository';
import { PaymentRepository } from '@/src/modules/customer-payments/repository/PaymentRepository';
import { PlanRepository } from '@/src/modules/plans/repository/PlanRepository';
import { UserRepository } from '@/src/modules/users/repository/UserRepository';

// Sums payment rows in USD using each row's frozen snapshot rate.
// monthlyRevenue and totalOutstandingBalance are canonical USD so the screen
// can re-format into the user's display currency at render.
function sumInUsd(rows: { amount: number; ratePerUsdSnapshot: number }[]): number {
  return rows.reduce((sum, r) => sum + r.amount / r.ratePerUsdSnapshot, 0);
}

export class DashboardService {
  private customerRepo = new CustomerRepository();
  private paymentRepo = new PaymentRepository();
  private planRepo = new PlanRepository();
  private userRepo = new UserRepository();

  async getMetrics(branchFilter: BranchFilter = null): Promise<DashboardMetrics> {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);

    const [
      totalCustomers,
      activeCustomers,
      paidRows,
      unpaidThisMonth,
      totalUsers,
      totalPlans,
      balanceRows,
    ] = await Promise.all([
      this.customerRepo.countAll(branchFilter),
      this.customerRepo.countActive(branchFilter),
      this.paymentRepo.paidAmountsForMonth(billingMonth, branchFilter),
      this.customerRepo.countUnpaidForMonth(billingMonth, branchFilter),
      this.userRepo.countAll(branchFilter),
      this.planRepo.countAll(branchFilter),
      this.paymentRepo.balancesForMonth(billingMonth, branchFilter),
    ]);

    return {
      totalCustomers,
      activeCustomers,
      monthlyRevenue: sumInUsd(paidRows),
      unpaidThisMonth,
      totalUsers,
      totalPlans,
      totalOutstandingBalance: sumInUsd(balanceRows),
    };
  }
}
