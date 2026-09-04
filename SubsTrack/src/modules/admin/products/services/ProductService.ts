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

  async addStock(
    productId: string,
    tenantId: string,
    quantity: number,
    note: string | null = null,
    userId: string | null = null,
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

  async revertMovement(
    movementId: string,
    userId: string | null = null,
  ): Promise<{ productId: string; onHand: number }> {
    const existing = await this.liveManualMovement(movementId);
    const row = await repository.voidMovement(existing.id, userId);
    const stock = await repository.stockOnHand([row.product_id]);
    return { productId: row.product_id, onHand: stock[row.product_id] ?? 0 };
  }

  private async liveManualMovement(movementId: string): Promise<DbStockMovement> {
    const existing = await repository.findMovement(movementId);
    if (!existing) throw new Error(i18n.t('errors.stock_movement_missing'));
    if (existing.reason === 'sale') {
      throw new Error(i18n.t('errors.stock_movement_sale_locked'));
    }
    if (existing.voided_at) throw new Error(i18n.t('errors.stock_movement_voided_locked'));
    return existing;
  }

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
