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
    const created = data as DbPlan;
    this.audit({
      table: 'plans',
      recordId: created.id,
      action: 'create',
      after: created,
      branchId: created.branch_id,
    });
    return created;
  }

  async update(id: string, payload: Partial<Pick<DbPlan, 'name' | 'price' | 'is_custom_price' | 'duration_months' | 'currency_id' | 'branch_id'>>): Promise<DbPlan> {
    return this.auditedUpdate<DbPlan>('plans', id, payload);
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    await this.auditedDelete<DbPlan>('plans', ids);
  }

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

const impl: IPlanRepository =
  Platform.OS === 'web' ? new PlanRepository() : new OfflinePlanRepository();

export default impl;
