import type { Sale, SaleItem } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import repository from '../repository/SaleRepository';
// Direct path, not the products barrel: the barrel pulls in components → the
// global store → saleSlice → back here.
import productService from '@/src/modules/admin/products/services/ProductService';
import {
  CreateSaleInput,
  CreateSaleItemInput,
  UpdateSaleInput,
  type FindSalesOptions,
} from '../utils/types'
import { mapDbSaleToSale } from '../utils/mapper';

// Frozen human summary of a sale's products, e.g. "Water ×2, Bread". Contains
// every product name so the Sales-tab search can match any of them.
function buildItemsSummary(items: CreateSaleItemInput[]): string {
  return items
    .map((it) => (it.quantity > 1 ? `${it.product.name} ×${it.quantity}` : it.product.name))
    .join(', ');
}

function totalOf(items: CreateSaleItemInput[]): number {
  return items.reduce((sum, it) => sum + it.unitAmount * it.quantity, 0);
}

// Units per product, which is the granularity stock cares about — the same
// product can sit on several lines and only their sum has to be covered.
function unitsByProduct(items: { productId: string; quantity: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
  return map;
}

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
    // Fresh read, not the cached product list — the store can be minutes stale.
    // Every entry point (sale form, quick actions, customer screens) goes
    // through here, so this is the one place stock can be enforced.
    await this.assertStockAvailable(input.items);
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const total = totalOf(input.items);
    const row = await repository.create({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      items_summary: buildItemsSummary(input.items),
      customer_id: input.customerId,
      recorded_by_user_id: input.recordedByUserId,
      total_amount: total,
      amount_paid: input.amountPaid,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      sold_at: new Date().toISOString(),
      notes: input.notes?.trim() || null,
      items: input.items.map((it) => ({
        tenant_id: input.tenantId,
        product_id: it.product.id,
        product_name_snapshot: it.product.name,
        quantity: it.quantity,
        unit_amount: it.unitAmount,
      })),
      // Stock leaving with the sale. Written by the repository alongside the
      // header + lines (offline: same transaction), so a sale can never exist
      // without the stock it consumed. sale_id is filled in there.
      movements: input.items.map((it) =>
        productService.movement(input.tenantId, it.product.id, -it.quantity, 'sale', {
          userId: input.recordedByUserId,
        }),
      ),
    });
    return mapDbSaleToSale(row);
  }

  // Corrects an existing sale in place: products, quantities, unit prices, the
  // sale currency (which RE-FREEZES rate_per_usd_snapshot, so the corrected row
  // is what history reports), customer, amount collected and notes. Only the
  // facts that identify the sale are fixed — id, tenant, sold_at, and who
  // originally recorded it. A voided sale is a closed record and stays locked.
  async updateSale(sale: Sale, input: UpdateSaleInput): Promise<Sale> {
    if (sale.voidedAt !== null) {
      throw new Error(i18n.t('errors.sale_voided_not_editable'));
    }
    this.validate(input);
    // The units this sale is holding come back to the pool as part of the same
    // edit, so they count as available — without the credit, merely re-pricing a
    // sale that took the last unit would fail its own stock check.
    await this.assertStockAvailable(input.items, unitsByProduct(sale.items));
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const row = await repository.update(sale.id, {
      branch_id: input.branchId,
      items_summary: buildItemsSummary(input.items),
      customer_id: input.customerId,
      total_amount: totalOf(input.items),
      amount_paid: input.amountPaid,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      notes: input.notes?.trim() || null,
      items: input.items.map((it) => ({
        tenant_id: sale.tenantId,
        product_id: it.product.id,
        product_name_snapshot: it.product.name,
        quantity: it.quantity,
        unit_amount: it.unitAmount,
      })),
      // Only a change in what left the shelf touches the ledger. A price, notes
      // or amount-paid fix leaves it alone, so correcting a sale doesn't litter
      // every product's stock history with a void + re-add pair.
      movements: this.sameStockFootprint(sale.items, input.items)
        ? null
        : input.items.map((it) =>
          productService.movement(sale.tenantId, it.product.id, -it.quantity, 'sale', {
            userId: input.actorUserId,
          }),
        ),
      actorUserId: input.actorUserId,
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

  // Collector wallet: non-voided sales someone is holding, with cash collected
  // (amountPaid > 0). Optionally scoped to one holder.
  async getHeldForWallet(
    branchFilter: BranchFilter = null,
    holderUserId: string | null = null,
  ): Promise<Sale[]> {
    const rows = await repository.heldForWallet(branchFilter, holderUserId);
    return rows.map(mapDbSaleToSale);
  }

  // Move these sales' cash to the next holder (or out of the system when
  // toUserId is null). WalletService decides who may do this.
  async transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    await repository.transferCustody(ids, fromUserId, toUserId, actorUserId);
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

  // True when the edited cart takes exactly the same units off the shelf as the
  // saved one. Compared per PRODUCT, not per line: splitting one line of 3 into
  // 1 + 2 moves no stock, so the ledger has nothing to correct.
  private sameStockFootprint(before: SaleItem[], after: CreateSaleItemInput[]): boolean {
    const was = unitsByProduct(before);
    const now = unitsByProduct(
      after.map((it) => ({ productId: it.product.id, quantity: it.quantity })),
    );
    if (was.size !== now.size) return false;
    for (const [id, quantity] of was) if (now.get(id) !== quantity) return false;
    return true;
  }

  // Blocks a sale that would oversell. The same product can sit on several cart
  // lines, so the check compares the SUM per product, not each line on its own.
  // `credited` is stock the same write gives back (an edit releases the units the
  // sale is currently holding), so it counts as available.
  // Advisory only: two devices selling the last unit offline can still both
  // succeed — the DB must accept whatever they replay (see gotchas).
  private async assertStockAvailable(
    items: CreateSaleItemInput[],
    credited: Map<string, number> = new Map(),
  ): Promise<void> {
    const needed = new Map<string, { name: string; quantity: number }>();
    for (const it of items) {
      const prev = needed.get(it.product.id);
      needed.set(it.product.id, {
        name: it.product.name,
        quantity: (prev?.quantity ?? 0) + it.quantity,
      });
    }
    const onHand = await productService.getStockOnHand([...needed.keys()]);
    for (const [id, { name, quantity }] of needed) {
      const available = (onHand[id] ?? 0) + (credited.get(id) ?? 0);
      if (available <= 0) {
        throw new Error(i18n.t('errors.sale_out_of_stock', { product: name }));
      }
      if (available < quantity) {
        throw new Error(i18n.t('errors.sale_insufficient_stock', { product: name, available }));
      }
    }
  }

  // Shape-based on purpose — the same rules hold for a new sale and an edited one.
  private validate(input: { items: CreateSaleItemInput[]; amountPaid: number }): void {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error(i18n.t('errors.sale_items_required'));
    }
    for (const it of input.items) {
      if (!it.product?.id) throw new Error(i18n.t('errors.sale_product_required'));
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        throw new Error(i18n.t('errors.sale_quantity_invalid'));
      }
      if (typeof it.unitAmount !== 'number' || Number.isNaN(it.unitAmount) || it.unitAmount <= 0) {
        throw new Error(i18n.t('errors.sale_amount_positive'));
      }
    }
    const total = totalOf(input.items);
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
