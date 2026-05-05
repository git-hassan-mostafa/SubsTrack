import type { DashboardMetrics } from '@/src/core/types';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import { CustomerRepository } from '@/src/modules/customers/repository/CustomerRepository';
import { PaymentRepository } from '@/src/modules/payments/repository/PaymentRepository';

export class DashboardService {
  private customerRepo = new CustomerRepository();
  private paymentRepo = new PaymentRepository();

  async getMetrics(): Promise<DashboardMetrics> {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);

    const [totalCustomers, activeCustomers, monthlyRevenue, unpaidThisMonth] = await Promise.all([
      this.customerRepo.countAll(),
      this.customerRepo.countActive(),
      this.paymentRepo.sumForMonth(billingMonth),
      this.customerRepo.countUnpaidForMonth(billingMonth),
    ]);

    return { totalCustomers, activeCustomers, monthlyRevenue, unpaidThisMonth };
  }
}
