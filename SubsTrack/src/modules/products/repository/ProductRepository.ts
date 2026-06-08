import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct } from '@/src/core/types/db';
import { applyBranchFilter, BRANCH_SCOPES } from '@/src/shared/lib/branchFilter';

class ProductRepository extends BaseRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbProduct[]> {
    let query = this.db
      .from('products')
      .select('*')
      .order('active', { ascending: false })
      .order('name');
    query = applyBranchFilter(query, branchFilter, BRANCH_SCOPES.products);
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
    return data as DbProduct;
  }

  async update(
    id: string,
    payload: Partial<
      Pick<DbProduct, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbProduct> {
    const { data, error } = await this.db
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbProduct;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('products').delete().eq('id', id);
    if (error) this.handleError(error);
  }

  // Count active products only — soft-deleted ones don't consume tier slots.
  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    query = applyBranchFilter(query, branchFilter, BRANCH_SCOPES.products);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }

  // Sales referencing this product. Drives soft-delete vs hard-delete in ProductService.
  async countReferences(id: string): Promise<number> {
    const { count, error } = await this.db
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);
    if (error) this.handleError(error);
    return count ?? 0;
  }
}

export default new ProductRepository()
