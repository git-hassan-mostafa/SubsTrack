import type { Currency, Product, StockMovement, TierPlan, TenantUsage } from '@/src/core/types';
import type { DbStockMovement } from '@/src/core/types/db';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import repository from '../repository/ProductRepository';
import type { CreateStockMovementPayload, StockCostRow } from '../repository/IProductRepository';
import { tierService } from '@/src/modules/admin/subscription';
import { mapDbProductToProduct, mapDbStockMovementToStockMovement } from '../utils/mapper';
import { ProductInput, RestockEntry } from '../utils/types';


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

  // Editing a product never touches stock — addStock owns that.
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
  /**
   * Add stock to one product — the ledger's only manual entry door, so a hand-made
   * row is always positive ('restock'). Stock that never arrived, or went back, is
   * corrected on the offending entry (updateMovement / revertMovement), which puts
   * the fix in the month the mistake was made instead of today. See gotcha #94.
   */
  async addStock(
    productId: string,
    tenantId: string,
    quantity: number,
    note: string | null = null,
    userId: string | null = null,
    // What the stock cost to buy — that, and only that, makes it an expense.
    cost: { unitCost: number | null; currency: Currency | null } | null = null,
  ): Promise<number> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(i18n.t('errors.stock_delta_invalid'));
    }
    await repository.addMovements([
      this.movement(tenantId, productId, quantity, 'restock', {
        note,
        userId,
        unitCost: cost?.unitCost ?? null,
        currency: cost?.currency ?? null,
      }),
    ]);
    const stock = await repository.stockOnHand([productId]);
    return stock[productId] ?? 0;
  }

  /**
   * Correct one MANUAL ledger row in place — the record itself was wrong (12 typed
   * for a 10-unit delivery, a unit cost of 0.50 that the invoice says was 0.45).
   *
   * This is the door for a mistyped entry, and `revertMovement` the door for one
   * that should not exist at all — both fix the month the entry belongs to, which
   * is why a manual entry can no longer remove stock instead. See gotcha #96.
   *
   * `quantity` is a MAGNITUDE, never signed — the direction comes from the row, so
   * a correction can never turn stock added into stock removed (that is a new
   * movement). Oversell is NOT blocked here: the DB accepts negative stock on
   * purpose (offline replay), so the sheet warns instead.
   */
  async updateMovement(
    movementId: string,
    input: {
      quantity: number;
      note?: string | null;
      cost?: { unitCost: number | null; currency: Currency | null } | null;
    },
  ): Promise<{ movement: StockMovement; onHand: number }> {
    const existing = await this.liveManualMovement(movementId);
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new Error(i18n.t('errors.stock_delta_invalid'));
    }
    const cost = this.costFields(
      existing.reason,
      input.cost?.unitCost ?? null,
      input.cost?.currency ?? null,
    );
    // Only a CHANGED cost re-freezes the rate: editing the quantity alone must not
    // silently re-value an old purchase at today's exchange rate.
    if (
      cost.unit_cost != null &&
      Number(existing.unit_cost) === cost.unit_cost &&
      existing.currency_id === cost.currency_id
    ) {
      cost.rate_per_usd_snapshot = existing.rate_per_usd_snapshot;
    }
    const row = await repository.updateMovement(movementId, {
      quantity_delta: existing.quantity_delta > 0 ? input.quantity : -input.quantity,
      note: input.note?.trim() || null,
      ...cost,
    });
    const stock = await repository.stockOnHand([row.product_id]);
    return {
      movement: mapDbStockMovementToStockMovement(row),
      onHand: stock[row.product_id] ?? 0,
    };
  }

  /**
   * Reverse one MANUAL ledger row — the entry should never have existed at all
   * (a delivery logged against the wrong product, a duplicate save). It stops
   * counting in the stock sum and, if it carried a cost, in Expenses for its own
   * month — the edit door's rule, not the costed-removal one (gotcha #96).
   *
   * A soft-void, not a delete: the row stays in the history marked reversed, so
   * "where did the other 12 bottles go" still has an answer.
   */
  async revertMovement(
    movementId: string,
    userId: string | null = null,
  ): Promise<{ productId: string; onHand: number }> {
    const existing = await this.liveManualMovement(movementId);
    const row = await repository.voidMovement(existing.id, userId);
    const stock = await repository.stockOnHand([row.product_id]);
    return { productId: row.product_id, onHand: stock[row.product_id] ?? 0 };
  }

  // What both correction doors agree on: the row must exist, must not belong to a
  // sale (SaleService swaps those when the sale is edited, so changing one here
  // would leave the sale and the ledger disagreeing), and must still be live.
  // In the SERVICE, not just hidden in the sheet's menu — see gotcha #96.
  private async liveManualMovement(movementId: string): Promise<DbStockMovement> {
    const existing = await repository.findMovement(movementId);
    if (!existing) throw new Error(i18n.t('errors.stock_movement_missing'));
    if (existing.reason === 'sale') {
      throw new Error(i18n.t('errors.stock_movement_sale_locked'));
    }
    if (existing.voided_at) throw new Error(i18n.t('errors.stock_movement_voided_locked'));
    return existing;
  }

  // Batch counterpart to addStock: one 'restock' row per product, appended in
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
  // never carry one — stock leaving is not money leaving. A NEGATIVE costed row
  // (only older data now, since a manual entry can no longer remove stock) reads
  // as a credit: amount = delta * cost, so it subtracts.
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
    return {
      tenant_id: tenantId,
      product_id: productId,
      quantity_delta: quantityDelta,
      reason,
      sale_id: extra.saleId ?? null,
      ...this.costFields(reason, extra.unitCost ?? null, extra.currency ?? null),
      note: extra.note?.trim() || null,
      recorded_by_user_id: extra.userId ?? null,
      occurred_at: extra.occurredAt ?? new Date().toISOString(),
    };
  }

  // The cost trio, in the one place that decides it — written together with a
  // frozen rate or all three null, and never on a 'sale' row (stock leaving is
  // not money leaving). A correction re-uses this, so the two can't drift.
  private costFields(
    reason: CreateStockMovementPayload['reason'],
    unitCost: number | null,
    currency: Currency | null,
  ): Pick<
    CreateStockMovementPayload,
    'unit_cost' | 'currency_id' | 'rate_per_usd_snapshot'
  > {
    const costed = reason !== 'sale' && typeof unitCost === 'number' && unitCost > 0;
    return {
      unit_cost: costed ? unitCost : null,
      currency_id: costed ? (currency?.id ?? null) : null,
      rate_per_usd_snapshot: costed ? (currency?.ratePerUsd ?? 1) : null,
    };
  }

  // The derived half of the Expenses view — stock bought in a date range, plus
  // any older costed removals, which give money back (negative amounts).
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
