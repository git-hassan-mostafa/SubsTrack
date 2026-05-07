import type { DashboardMetrics } from '@/src/core/types';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import { CustomerRepository } from '@/src/modules/customers/repository/CustomerRepository';
import { PaymentRepository } from '@/src/modules/payments/repository/PaymentRepository';
import { PlanRepository } from '@/src/modules/plans/repository/PlanRepository';
import { UserRepository } from '@/src/modules/users/repository/UserRepository';

export class DashboardService {
  private customerRepo = new CustomerRepository();
  private paymentRepo = new PaymentRepository();
  private planRepo = new PlanRepository();
  private userRepo = new UserRepository();

  async getMetrics(): Promise<DashboardMetrics> {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);

    const [totalCustomers, activeCustomers, monthlyRevenue, unpaidThisMonth, totalUsers, totalPlans] =
      await Promise.all([
        this.customerRepo.countAll(),
        this.customerRepo.countActive(),
        this.paymentRepo.sumForMonth(billingMonth),
        this.customerRepo.countUnpaidForMonth(billingMonth),
        this.userRepo.countAll(),
        this.planRepo.countAll(),
      ]);

    return { totalCustomers, activeCustomers, monthlyRevenue, unpaidThisMonth, totalUsers, totalPlans };
  }
}
