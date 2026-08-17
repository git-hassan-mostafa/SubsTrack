import type { Currency, Product, StockMovement, TierPlan, TenantUsage } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import repository from '../repository/ProductRepository';
import type { CreateStockMovementPayload, StockCostRow } from '../repository/IProductRepository';
import { tierService } from '@/src/modules/admin/subscription';
import { mapDbProductToProduct, mapDbStockMovementToStockMovement } from '../utils/mapper';
import { ProductInput, RestockEntry, StockAdjustReason } from '../utils/types';


class ProductService {
  // The unscoped ledger read is a superset of `rows` (same RLS scope) but doesn't
  // depend on it, so both go out together instead of one after the other.
  async getProducts(branchFilter: BranchFilter = null): Promise<Product[]> {
    const [rows, stock] = await Promise.all([
      repository.findAll(branchFilter),
      repository.stockOnHand(),
    ]);
    return rows.map((r) => mapDbProductToProduct(r, stock[r.id] ?? 0));
  }

  async createProduct(
    data: ProductInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
    userId: string | null = null,
    // Resolved from data.costCurrencyId by the caller — it carries the live rate
    // the opening stock's cost is frozen at.
    costCurrency: Currency | null = null,
  ): Promise<Product> {
    this.validate(data);
    tierService.assertCanCreate(tier, usage, 'products');
    try {
      const row = await repository.create({
        tenant_id: tenantId,
        branch_id: data.branchId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        currency_id: data.currencyId,
        cost_price: data.costPrice ?? null,
        cost_currency_id: data.costCurrencyId,
        active: true,
      });
      // Opening balance becomes the first ledger entry (0 writes no row).
      const initial = data.initialStock ?? 0;
      if (initial > 0) {
        await repository.addMovements([
          this.movement(tenantId, row.id, initial, 'initial', {
            userId,
            unitCost: data.initialStockUnitCost ?? data.costPrice ?? null,
            currency: costCurrency,
          }),
        ]);
      }
      return mapDbProductToProduct(row, initial);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  // Editing a product never touches stock — adjustStock owns that.
  async updateProduct(id: string, data: ProductInput): Promise<Product> {
    this.validate(data);
    try {
      const row = await repository.update(id, {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        currency_id: data.currencyId,
        cost_price: data.costPrice ?? null,
        cost_currency_id: data.costCurrencyId,
        branch_id: data.branchId,
      });
      const stock = await repository.stockOnHand([id]);
      return mapDbProductToProduct(row, stock[id] ?? 0);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  // Soft-delete if any sales reference the product (preserves history); otherwise hard-delete.
  // Returns the mode so the UI can communicate the outcome — mirrors CurrencyService.deleteCurrency.
  async deleteProduct(id: string): Promise<'hard' | 'soft'> {
    const refs = await repository.countReferences(id);
    if (refs > 0) {
      await repository.update(id, { active: false });
      return 'soft';
    }
    await repository.delete(id);
    return 'hard';
  }

  async reactivateProduct(id: string): Promise<Product> {
    const row = await repository.update(id, { active: true });
    const stock = await repository.stockOnHand([id]);
    return mapDbProductToProduct(row, stock[id] ?? 0);
  }

  // Batch counterpart to deleteProduct: products with sales are soft-deleted,
  // the rest hard-deleted — each group in a single statement (≤3 round-trips
  // total, independent of count). Returns the id split so the store can update
  // its list without a refetch.
  async deleteManyProducts(
    ids: string[],
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const referenced = await repository.referencedIds(ids);
    const soft = ids.filter((id) => referenced.has(id));
    const hard = ids.filter((id) => !referenced.has(id));
    await Promise.all([
      repository.deactivateMany(soft),
      repository.deleteMany(hard),
    ]);
    return { hard, soft };
  }

  // ── Stock ────────────────────────────────────────────────────────────────
  // Stock on hand is the ledger sum, so a manual change is just one more row:
  // positive delta = restock, negative = a correction (damaged / miscounted).
  async adjustStock(
    productId: string,
    tenantId: string,
    delta: number,
    reason: StockAdjustReason,
    note: string | null = null,
    userId: string | null = null,
    // Only a restock spends money; a negative 'adjustment' (damage, miscount) is
    // stock lost, not cash out, so it never carries a cost.
    cost: { unitCost: number | null; currency: Currency | null } | null = null,
  ): Promise<number> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error(i18n.t('errors.stock_delta_invalid'));
    }
    const costed = reason === 'restock' ? cost : null;
    await repository.addMovements([
      this.movement(tenantId, productId, delta, reason, {
        note,
        userId,
        unitCost: costed?.unitCost ?? null,
        currency: costed?.currency ?? null,
      }),
    ]);
    const stock = await repository.stockOnHand([productId]);
    return stock[productId] ?? 0;
  }

  // Batch counterpart to adjustStock: one 'restock' row per product, appended in
  // a single write so a whole delivery lands together. Returns the new on-hand
  // per product so the store can refresh its list without a refetch.
  // One delivery = one currency, so `currency` is shared by every line and each
  // entry only carries its own unit cost.
  async restockMany(
    entries: RestockEntry[],
    tenantId: string,
    note: string | null = null,
    userId: string | null = null,
    currency: Currency | null = null,
  ): Promise<Record<string, number>> {
    const valid = entries.filter((e) => Number.isInteger(e.quantity) && e.quantity > 0);
    if (valid.length === 0) throw new Error(i18n.t('errors.stock_delta_invalid'));
    await repository.addMovements(
      valid.map((e) =>
        this.movement(tenantId, e.productId, e.quantity, 'restock', {
          note,
          userId,
          unitCost: e.unitCost ?? null,
          currency,
        }),
      ),
    );
    return repository.stockOnHand(valid.map((e) => e.productId));
  }

  async getStockOnHand(productIds?: string[]): Promise<Record<string, number>> {
    return repository.stockOnHand(productIds);
  }

  async getMovements(productId: string, limit = 20): Promise<StockMovement[]> {
    const rows = await repository.movementsForProduct(productId, limit);
    return rows.map(mapDbStockMovementToStockMovement);
  }

  // One place that fills the ledger row's shape, so every writer stays in sync.
  // Public because SaleService builds its own 'sale' rows to hand to the sale
  // repository (they must be written in the same transaction as the sale).
  //
  // `unitCost` + `currency` are what make a purchase an expense; they are
  // written together with a frozen rate, or all three stay null. 'sale' rows
  // never carry one — stock leaving is not money leaving.
  movement(
    tenantId: string,
    productId: string,
    quantityDelta: number,
    reason: CreateStockMovementPayload['reason'],
    extra: {
      saleId?: string | null;
      note?: string | null;
      userId?: string | null;
      occurredAt?: string;
      unitCost?: number | null;
      currency?: Currency | null;
    } = {},
  ): CreateStockMovementPayload {
    const costed = reason !== 'sale' && typeof extra.unitCost === 'number' && extra.unitCost > 0;
    return {
      tenant_id: tenantId,
      product_id: productId,
      quantity_delta: quantityDelta,
      reason,
      sale_id: extra.saleId ?? null,
      unit_cost: costed ? extra.unitCost! : null,
      currency_id: costed ? (extra.currency?.id ?? null) : null,
      rate_per_usd_snapshot: costed ? (extra.currency?.ratePerUsd ?? 1) : null,
      note: extra.note?.trim() || null,
      recorded_by_user_id: extra.userId ?? null,
      occurred_at: extra.occurredAt ?? new Date().toISOString(),
    };
  }

  // The derived half of the Expenses view — stock bought in a date range.
  async getStockCostsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<StockCostRow[]> {
    return repository.stockCostsInRange(startIso, endExclusiveIso, branchFilter);
  }

  private validate(data: ProductInput): void {
    if (!data.name?.trim()) throw new Error(i18n.t('errors.product_name_required'));
    if (typeof data.price !== 'number' || Number.isNaN(data.price)) {
      throw new Error(i18n.t('errors.product_price_required'));
    }
    if (data.price <= 0) throw new Error(i18n.t('errors.product_price_positive'));
    // Cost is optional, but a typed one must be a real amount.
    if (data.costPrice != null && !(data.costPrice > 0)) {
      throw new Error(i18n.t('errors.product_cost_positive'));
    }
    const initial = data.initialStock ?? 0;
    if (!Number.isInteger(initial) || initial < 0) {
      throw new Error(i18n.t('errors.product_stock_invalid'));
    }
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_products_name_tenant_branch') || msg.includes('duplicate')) {
      throw new Error(i18n.t('errors.product_name_exists'));
    }
    throw err instanceof Error ? err : new Error(i18n.t('errors.connection_error'));
  }
}

export default new ProductService()
