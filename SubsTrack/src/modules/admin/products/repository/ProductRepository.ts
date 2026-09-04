import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct, DbStockMovement } from '@/src/core/types/db';
import type {
  CreateStockMovementPayload,
  IProductRepository,
  StockCostRow,
  UpdateStockMovementPayload,
} from './IProductRepository';
import { toStockCostRow } from '../utils/mapper';
import { OfflineProductRepository } from './ProductRepository.offline';

export class ProductRepository extends BaseRepository implements IProductRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbProduct[]> {
    let query = this.db
      .from('products')
      .select('*')
      .order('active', { ascending: false })
      .order('name');
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.products);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbProduct[];
  }

  async create(
    payload: Omit<DbProduct, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<DbProduct> {
    const { data, error } = await this.db
      .from('products')
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    const created = data as DbProduct;
    this.audit({
      table: 'products',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: created.branch_id,
    });
    return created;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbProduct,
        | 'name' | 'description' | 'price' | 'currency_id'
        | 'cost_price' | 'cost_currency_id' | 'branch_id' | 'active'
      >
    >,
  ): Promise<DbProduct> {
    return this.auditedUpdate<DbProduct>('products', id, payload, {
      action: payload.active === true ? 'restore' : 'update',
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbProduct>('products', ids);
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbProduct>('products', id, { active: false });
    }
  }

  async referencedIds(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('sale_items', 'product_id', ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.products);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async countReferences(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('sale_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  async stockOnHand(productIds?: string[]): Promise<Record<string, number>> {
    if (productIds && productIds.length === 0) return {};
    let query = this.db.from('product_stock').select('product_id, on_hand');
    if (productIds) query = query.in('product_id', productIds);
    const { data, error } = await query;
    if (error) this.handleError(error);
    const totals: Record<string, number> = {};
    for (const r of (data ?? []) as { product_id: string; on_hand: number }[]) {
      totals[r.product_id] = Number(r.on_hand);
    }
    return totals;
  }

  async addMovements(payloads: CreateStockMovementPayload[]): Promise<void> {
    if (payloads.length === 0) return;
    const { error } = await this.db.from('stock_movements').insert(payloads);
    if (error) this.handleError(error);
  }

  async movementsForProduct(productId: string, limit = 20): Promise<DbStockMovement[]> {
    const { data, error } = await this.db
      .from('stock_movements')
      .select('*')
      .eq('product_id', productId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (error) this.handleError(error);
    return (data ?? []) as DbStockMovement[];
  }

  async findMovement(id: string): Promise<DbStockMovement | null> {
    const { data, error } = await this.db
      .from('stock_movements')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data as DbStockMovement | null) ?? null;
  }

  async updateMovement(
    id: string,
    payload: UpdateStockMovementPayload,
  ): Promise<DbStockMovement> {
    return this.auditedUpdate<DbStockMovement>('stock_movements', id, payload, {
      branchColumn: null,
      audit: await this.movementAudit(id),
    });
  }

  async voidMovement(id: string, voidedBy: string | null): Promise<DbStockMovement> {
    return this.auditedUpdate<DbStockMovement>(
      'stock_movements',
      id,
      { voided_at: new Date().toISOString(), voided_by: voidedBy },
      { action: 'void', branchColumn: null, audit: await this.movementAudit(id) },
    );
  }

  private async movementAudit(
    movementId: string,
  ): Promise<{ branchId: string | null; subject: string | null }> {
    const { data } = await this.db
      .from('stock_movements')
      .select('products(branch_id, name)')
      .eq('id', movementId)
      .maybeSingle();
    const product = (data as { products: { branch_id: string | null; name: string } | null } | null)
      ?.products;
    return { branchId: product?.branch_id ?? null, subject: product?.name ?? null };
  }

  async stockCostsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter = null,
  ): Promise<StockCostRow[]> {
    let query = this.db
      .from('stock_movements')
      .select(
        'id, product_id, quantity_delta, unit_cost, currency_id, rate_per_usd_snapshot, occurred_at, recorded_by_user_id, products!inner(name, branch_id)',
      )
      .neq('reason', 'sale')
      .not('unit_cost', 'is', null)
      .is('voided_at', null)
      .gte('occurred_at', startIso)
      .lt('occurred_at', endExclusiveIso)
      .order('occurred_at', { ascending: false });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.stock_movements);
    const { data, error } = await query;
    if (error) this.handleError(error);
    type Row = Parameters<typeof toStockCostRow>[0] & {
      products: { name: string; branch_id: string | null } | null;
    };
    return ((data ?? []) as unknown as Row[]).map((r) => toStockCostRow(r, r.products));
  }
}

const impl: IProductRepository =
  Platform.OS === 'web' ? new ProductRepository() : new OfflineProductRepository();

export default impl;
