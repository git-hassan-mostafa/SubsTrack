import type {
  CustomDebt,
  DebtItem,
  DebtPayment,
  DebtPaymentItem,
} from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import { paymentService } from '@/src/modules/customer-payments';
import { saleService } from '@/src/modules/sales';
import repository from '../repository/DebtRepository';
import { mapDbCustomDebtToCustomDebt, mapDbDebtPaymentToDebtPayment } from '../utils/mapper';
import type {
  CreateCustomDebtInput,
  CreateDebtPaymentInput,
  DebtsFilter,
  DebtsView,
} from '../utils/types';

// Sums money rows in USD via each row's frozen snapshot rate (drift-free) —
// same principle as DashboardService.sumInUsd.
function sumUsd(rows: { amount: number; ratePerUsdSnapshot: number }[]): number {
  return rows.reduce((s, r) => s + r.amount / r.ratePerUsdSnapshot, 0);
}

class DebtService {
  // Everything the Debts panel needs in one fetch: debt items (months + sales +
  // custom), debt payments, and the net summary for the scope. Category filtering
  // is done client-side. Optionally scoped to a single customer.
  async getDebtsView(filter: DebtsFilter = {}): Promise<DebtsView> {
    const branchFilter = filter.branchFilter ?? null;
    const customerId = filter.customerId ?? null;
    const forCustomer = (cid: string | null | undefined) =>
      customerId == null || cid === customerId;

    const [partialPayments, partialSales, customDebts, debtPayments] = await Promise.all([
      paymentService.getPartialPayments(branchFilter),
      saleService.getPartialSales(branchFilter),
      repository.customDebts(branchFilter),
      repository.debtPayments(branchFilter),
    ]);

    // "Months" — each partial subscription payment owes its balance.
    const monthItems: DebtItem[] = partialPayments
      .filter((p) => forCustomer(p.customerId))
      .map((p) => ({
        id: p.id,
        category: 'months',
        customerId: p.customerId,
        customerName: p.customerName,
        label: p.planName ?? i18n.t('debts.subscription'),
        remaining: p.balance,
        currencyId: p.currencyId,
        ratePerUsdSnapshot: p.ratePerUsdSnapshot,
        date: p.billingMonth,
        sourceType: 'payment',
      }));

    // "Sales" — each partial sale owes total − amount paid.
    const saleItems: DebtItem[] = partialSales
      .filter((s) => s.customerId != null && forCustomer(s.customerId))
      .map((s) => ({
        id: s.id,
        category: 'sales',
        customerId: s.customerId as string,
        customerName: s.customer?.name ?? '',
        label: s.productNameSnapshot,
        remaining: s.totalAmount - s.amountPaid,
        currencyId: s.currencyId,
        ratePerUsdSnapshot: s.ratePerUsdSnapshot,
        date: s.soldAt,
        sourceType: 'sale',
      }));

    // "Custom" — hand-typed debts.
    const customItems: DebtItem[] = customDebts
      .filter((d) => forCustomer(d.customer_id))
      .map((d) => ({
        id: d.id,
        category: 'custom',
        customerId: d.customer_id,
        customerName: d.customers?.name ?? '',
        label: d.description ?? i18n.t('debts.custom_debt'),
        remaining: Number(d.amount),
        currencyId: d.currency_id,
        ratePerUsdSnapshot: Number(d.rate_per_usd_snapshot),
        date: d.incurred_at,
        sourceType: 'custom_debt',
      }));

    // Newest first across categories.
    const items = [...monthItems, ...saleItems, ...customItems].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );

    const payments: DebtPaymentItem[] = debtPayments
      .filter((p) => forCustomer(p.customer_id))
      .map((p) => ({
        id: p.id,
        customerId: p.customer_id,
        customerName: p.customers?.name ?? '',
        amount: Number(p.amount),
        currencyId: p.currency_id,
        ratePerUsdSnapshot: Number(p.rate_per_usd_snapshot),
        paidAt: p.paid_at,
        notes: p.notes,
      }));

    const grossUsd = sumUsd(items.map((i) => ({ amount: i.remaining, ratePerUsdSnapshot: i.ratePerUsdSnapshot })));
    const paymentsUsd = sumUsd(payments);
    return { items, payments, summary: { grossUsd, paymentsUsd, netUsd: grossUsd - paymentsUsd } };
  }

  async addCustomDebt(input: CreateCustomDebtInput): Promise<CustomDebt> {
    this.validateCustomer(input.customerId);
    this.validateAmount(input.amount);
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) throw new Error(i18n.t('errors.rate_snapshot_positive'));
    const row = await repository.createCustomDebt({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      description: input.description?.trim() || null,
      amount: input.amount,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      recorded_by_user_id: input.recordedByUserId,
      incurred_at: new Date().toISOString(),
      notes: null,
    });
    return mapDbCustomDebtToCustomDebt(row);
  }

  async voidCustomDebt(id: string, voidedBy: string, reason: string | null): Promise<CustomDebt> {
    const row = await repository.voidCustomDebt(id, voidedBy, reason?.trim() || null);
    return mapDbCustomDebtToCustomDebt(row);
  }

  async addDebtPayment(input: CreateDebtPaymentInput): Promise<DebtPayment> {
    this.validateCustomer(input.customerId);
    this.validateAmount(input.amount);
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) throw new Error(i18n.t('errors.rate_snapshot_positive'));
    const row = await repository.createDebtPayment({
      tenant_id: input.tenantId,
      customer_id: input.customerId,
      amount: input.amount,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      received_by_user_id: input.receivedByUserId,
      paid_at: new Date().toISOString(),
      notes: input.notes?.trim() || null,
    });
    return mapDbDebtPaymentToDebtPayment(row);
  }

  async voidDebtPayment(id: string, voidedBy: string, reason: string | null): Promise<DebtPayment> {
    const row = await repository.voidDebtPayment(id, voidedBy, reason?.trim() || null);
    return mapDbDebtPaymentToDebtPayment(row);
  }

  // Sums all debt (across categories) minus all debt payments, in USD, for the
  // scope. Convenience over getDebtsView when only the net is needed.
  async getNetUsd(branchFilter: BranchFilter = null, customerId: string | null = null): Promise<number> {
    const { summary } = await this.getDebtsView({ branchFilter, customerId });
    return summary.netUsd;
  }

  private validateCustomer(customerId: string): void {
    if (!customerId) throw new Error(i18n.t('errors.debt_customer_required'));
  }

  private validateAmount(amount: number): void {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new Error(i18n.t('errors.debt_amount_positive'));
    }
  }
}

export default new DebtService();
