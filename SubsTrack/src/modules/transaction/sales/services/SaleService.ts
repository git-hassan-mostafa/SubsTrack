import type { Sale } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import repository from '../repository/SaleRepository';
import { CreateSaleInput, type FindSalesOptions } from '../utils/types'
import { mapDbSaleToSale } from '../utils/mapper';


class SaleService {
  async getSales(opts: FindSalesOptions = {}): Promise<Sale[]> {
    const rows = await repository.findAll(opts);
    return rows.map(mapDbSaleToSale);
  }

  async getSalesForCustomer(customerId: string, limit = 20): Promise<Sale[]> {
    const rows = await repository.findByCustomer(customerId, limit);
    return rows.map(mapDbSaleToSale);
  }

  async createSale(input: CreateSaleInput): Promise<Sale> {
    this.validate(input);
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const row = await repository.create({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      product_id: input.product.id,
      product_name_snapshot: input.product.name,
      customer_id: input.customerId,
      recorded_by_user_id: input.recordedByUserId,
      quantity: input.quantity,
      unit_amount: input.unitAmount,
      amount_paid: input.amountPaid,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      sold_at: new Date().toISOString(),
      notes: input.notes?.trim() || null,
    });
    return mapDbSaleToSale(row);
  }

  // Buckets monthlyTotals() rows into per-calendar-month USD sums ("YYYY-MM"
  // keys, by sold_at) — the authoritative total for a Sales tab section
  // header, independent of how many of that month's rows are paginated in.
  async getMonthlyTotals(opts: FindSalesOptions = {}): Promise<Record<string, number>> {
    const rows = await repository.monthlyTotals(opts);
    const totals: Record<string, number> = {};
    for (const r of rows) {
      const d = new Date(r.soldAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      totals[key] = (totals[key] ?? 0) + r.amount / r.ratePerUsdSnapshot;
    }
    return totals;
  }

  // Non-voided sales that still owe money (partial sales), for the Debts feature.
  async getPartialSales(branchFilter: BranchFilter = null): Promise<Sale[]> {
    const rows = await repository.partialSales(branchFilter);
    return rows.map(mapDbSaleToSale);
  }

  // Collector wallet: non-voided, still-in-wallet (unremitted) sales with cash
  // collected (amountPaid > 0). Optionally scoped to one recorder.
  async getUnremittedForWallet(
    branchFilter: BranchFilter = null,
    collectorUserId: string | null = null,
  ): Promise<Sale[]> {
    const rows = await repository.unremittedForWallet(branchFilter, collectorUserId);
    return rows.map(mapDbSaleToSale);
  }

  // Mark sales as handed over (remitted) by an admin.
  async markRemitted(ids: string[], remittedBy: string): Promise<void> {
    await repository.markRemitted(ids, remittedBy);
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<Sale> {
    const row = await repository.voidSale(id, voidedBy, reason.trim());
    return mapDbSaleToSale(row);
  }

  // Sums all non-voided sales for the given calendar month, converted to USD
  // via each sale's frozen rate_per_usd_snapshot. Drift-free — mirrors the
  // pattern documented in CLAUDE.md gotcha #22 for payments.
  async sumForMonthUsd(year: number, month: number, branchFilter: BranchFilter = null): Promise<number> {
    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEndExclusive = new Date(year, month, 1).toISOString();
    const rows = await repository.totalsForMonth(monthStart, monthEndExclusive, branchFilter);
    return rows.reduce((acc, r) => acc + r.amount / r.ratePerUsdSnapshot, 0);
  }

  private validate(input: CreateSaleInput): void {
    if (!input.product?.id) throw new Error(i18n.t('errors.sale_product_required'));
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new Error(i18n.t('errors.sale_quantity_invalid'));
    }
    if (typeof input.unitAmount !== 'number' || Number.isNaN(input.unitAmount) || input.unitAmount <= 0) {
      throw new Error(i18n.t('errors.sale_amount_positive'));
    }
    const total = input.unitAmount * input.quantity;
    if (
      typeof input.amountPaid !== 'number' ||
      Number.isNaN(input.amountPaid) ||
      input.amountPaid < 0 ||
      input.amountPaid > total + 1e-9
    ) {
      throw new Error(i18n.t('errors.sale_amount_paid_invalid'));
    }
  }
}

export default new SaleService()
