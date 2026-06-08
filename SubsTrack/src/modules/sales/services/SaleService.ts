import type { Currency, Product, Sale } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import type { DbSale } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import { SaleRepository, type FindSalesOptions } from '../repository/SaleRepository';
import { mapDbProductToProduct } from '@/src/modules/products/services/ProductService';
import { mapDbCustomerToCustomer } from '@/src/modules/customers/services/CustomerService';

export function mapDbSaleToSale(db: DbSale): Sale {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    branchId: db.branch_id,
    productId: db.product_id,
    productNameSnapshot: db.product_name_snapshot,
    customerId: db.customer_id,
    recordedByUserId: db.recorded_by_user_id,
    quantity: db.quantity,
    unitAmount: Number(db.unit_amount),
    totalAmount: Number(db.total_amount),
    currencyId: db.currency_id,
    ratePerUsdSnapshot: Number(db.rate_per_usd_snapshot),
    soldAt: db.sold_at,
    voidedAt: db.voided_at,
    voidedBy: db.voided_by,
    voidReason: db.void_reason,
    notes: db.notes,
    createdAt: db.created_at,
    product: db.products ? mapDbProductToProduct(db.products) : null,
    customer: db.customers ? mapDbCustomerToCustomer(db.customers) : null,
  };
}

// Input shape from the form. `product` is the resolved Product (we use it to
// snapshot the name + product_id). `currency` is the chosen non-USD Currency
// or null for USD — we snapshot ratePerUsd from this.
export interface CreateSaleInput {
  product: Product;
  customerId: string | null;
  branchId: string | null;
  quantity: number;
  unitAmount: number;
  currency: Currency | null;
  recordedByUserId: string | null;
  tenantId: string;
  notes: string | null;
}

export class SaleService {
  private repository = new SaleRepository();

  async getSales(opts: FindSalesOptions = {}): Promise<Sale[]> {
    const rows = await this.repository.findAll(opts);
    return rows.map(mapDbSaleToSale);
  }

  async getSalesForCustomer(customerId: string, limit = 20): Promise<Sale[]> {
    const rows = await this.repository.findByCustomer(customerId, limit);
    return rows.map(mapDbSaleToSale);
  }

  async createSale(input: CreateSaleInput): Promise<Sale> {
    this.validate(input);
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const row = await this.repository.create({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      product_id: input.product.id,
      product_name_snapshot: input.product.name,
      customer_id: input.customerId,
      recorded_by_user_id: input.recordedByUserId,
      quantity: input.quantity,
      unit_amount: input.unitAmount,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      sold_at: new Date().toISOString(),
      notes: input.notes?.trim() || null,
    });
    return mapDbSaleToSale(row);
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<Sale> {
    const row = await this.repository.voidSale(id, voidedBy, reason.trim());
    return mapDbSaleToSale(row);
  }

  // Sums all non-voided sales for the given calendar month, converted to USD
  // via each sale's frozen rate_per_usd_snapshot. Drift-free — mirrors the
  // pattern documented in CLAUDE.md gotcha #22 for payments.
  async sumForMonthUsd(year: number, month: number, branchFilter: BranchFilter = null): Promise<number> {
    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEndExclusive = new Date(year, month, 1).toISOString();
    const rows = await this.repository.totalsForMonth(monthStart, monthEndExclusive, branchFilter);
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
  }
}
