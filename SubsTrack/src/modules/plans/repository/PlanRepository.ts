import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbPlan } from '@/src/core/types/db';
import { applyBranchFilter, BRANCH_SCOPES } from '@/src/shared/lib/branchFilter';

class PlanRepository extends BaseRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbPlan[]> {
    let query = this.db
      .from('plans')
      .select('*')
      .order('name');
    query = applyBranchFilter(query, branchFilter, BRANCH_SCOPES.plans);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbPlan[];
  }

  async create(payload: Omit<DbPlan, 'id' | 'created_at'>): Promise<DbPlan> {
    const { data, error } = await this.db
      .from('plans')
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbPlan;
  }

  async update(id: string, payload: Partial<Pick<DbPlan, 'name' | 'price' | 'is_custom_price' | 'duration_months' | 'currency_id' | 'branch_id'>>): Promise<DbPlan> {
    const { error: updateError } = await this.db
      .from('plans')
      .update(payload)
      .eq('id', id)
      .select()
    if (updateError) return this.handleError(updateError)

    const { data, error } = await this.db.from('plans')
      .select()
      .eq('id', id)
      .single();
    if (error) this.handleError(error);
    return data as DbPlan;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('plans').delete().eq('id', id);
    if (error) this.handleError(error);
  }

  // Plans use the 'shared' scope: NULL means "available to every branch".
  // Filtering by a specific branch therefore includes shared plans alongside
  // that branch's plans. See BRANCH_SCOPES.plans.
  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('plans')
      .select('id', { count: 'exact', head: true });
    query = applyBranchFilter(query, branchFilter, BRANCH_SCOPES.plans);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }
}

export default new PlanRepository()
