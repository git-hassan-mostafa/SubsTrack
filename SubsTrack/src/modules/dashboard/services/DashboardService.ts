import type { DashboardMetrics, Currency } from '@/src/core/types';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import { toUsd } from '@/src/core/utils/currency';
import { CustomerRepository } from '@/src/modules/customers/repository/CustomerRepository';
import { PaymentRepository } from '@/src/modules/customer-payments/repository/PaymentRepository';
import { PlanRepository } from '@/src/modules/plans/repository/PlanRepository';
import { UserRepository } from '@/src/modules/users/repository/UserRepository';
import { CurrencyService } from '@/src/modules/currencies/services/CurrencyService';

// Sum a list of {amount, currencyId} entries by first converting each to USD.
// monthlyRevenue and totalOutstandingBalance are always stored in USD canonical
// form so the screen can re-format into the user's display currency at render.
function sumInUsd(
  rows: { amount: number; currencyId: string | null }[],
  byId: Map<string, Currency>,
): number {
  return rows.reduce((sum, r) => sum + toUsd(r.amount, r.currencyId ? byId.get(r.currencyId) ?? null : null), 0);
}

export class DashboardService {
  private customerRepo = new CustomerRepository();
  private paymentRepo = new PaymentRepository();
  private planRepo = new PlanRepository();
  private userRepo = new UserRepository();
  private currencyService = new CurrencyService();

  async getMetrics(): Promise<DashboardMetrics> {
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
      currencies,
    ] = await Promise.all([
      this.customerRepo.countAll(),
      this.customerRepo.countActive(),
      this.paymentRepo.paidAmountsForMonth(billingMonth),
      this.customerRepo.countUnpaidForMonth(billingMonth),
      this.userRepo.countAll(),
      this.planRepo.countAll(),
      this.paymentRepo.balancesForMonth(billingMonth),
      this.currencyService.getCurrencies(),
    ]);

    const byId = new Map(currencies.map((c) => [c.id, c] as const));
    const monthlyRevenue = sumInUsd(paidRows, byId);
    const totalOutstandingBalance = sumInUsd(balanceRows, byId);

    return {
      totalCustomers,
      activeCustomers,
      monthlyRevenue,
      unpaidThisMonth,
      totalUsers,
      totalPlans,
      totalOutstandingBalance,
    };
  }
}
