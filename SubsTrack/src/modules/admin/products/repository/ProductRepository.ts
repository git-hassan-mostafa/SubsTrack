import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct, DbStockMovement } from '@/src/core/types/db';
import type { CreateStockMovementPayload, IProductRepository } from './IProductRepository';
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
      Pick<DbProduct, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbProduct> {
    return this.auditedUpdate<DbProduct>('products', id, payload, {
      action: payload.active === true ? 'restore' : 'update',
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  // Hard-delete many products in one statement.
  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbProduct>('products', ids);
  }

  // Soft-delete many products in one statement.
  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.auditedUpdate<DbProduct>('products', id, { active: false });
    }
  }

  // The subset of the given products that any sale line references — one query.
  async referencedIds(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('sale_items', 'product_id', ids);
  }

  // Count active products only — soft-deleted ones don't consume tier slots.
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

  // Sale lines referencing this product. Drives soft-delete vs hard-delete in ProductService.
  async countReferences(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('sale_items')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }

  // Reads the `product_stock` view (SUM of the non-voided ledger rows, grouped
  // per product). The view is security_invoker, so tenant/branch RLS applies.
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
}

// Platform seam: web talks to Supabase directly (unchanged); native uses the
// offline SQLite repository. Services import this default, so neither services
// nor slices change. The offline class is only constructed on native, so web
// never opens a local DB.
const impl: IProductRepository =
  Platform.OS === 'web' ? new ProductRepository() : new OfflineProductRepository();

export default impl;
