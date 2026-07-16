import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbPlan } from '@/src/core/types/db';
import type { IPlanRepository } from './IPlanRepository';
import { OfflinePlanRepository } from './PlanRepository.offline';

export class PlanRepository extends BaseRepository implements IPlanRepository {
  async findAll(branchFilter: BranchFilter = null): Promise<DbPlan[]> {
    let query = this.db
      .from('plans')
      .select('*')
      .order('name');
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.plans);
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

  // Hard-delete many plans in one statement. Service lines on a deleted plan
  // fall back to plan-less via the customer_plans.plan_id ON DELETE SET NULL
  // constraint (payment history is preserved by the plan_id snapshot on payments).
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db.from('plans').delete().in('id', ids);
    if (error) this.handleError(error);
  }

  // Plans use the 'shared' scope: NULL means "available to every branch".
  // Filtering by a specific branch therefore includes shared plans alongside
  // that branch's plans. See BRANCH_SCOPES.plans.
  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    let query = this.db
      .from('plans')
      .select('id', { count: 'exact', head: true });
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.plans);
    const { count, error } = await query;
    if (error) this.handleError(error);
    return count ?? 0;
  }
}

// Platform seam: web talks to Supabase directly (unchanged); native uses the
// offline SQLite repository. Services import this default, so neither services
// nor slices change. The offline class is only constructed on native, so web
// never opens a local DB.
const impl: IPlanRepository =
  Platform.OS === 'web' ? new PlanRepository() : new OfflinePlanRepository();

export default impl;
