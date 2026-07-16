import type { BranchFilter } from '@/src/core/constants';
import type { DbPlan } from '@/src/core/types/db';

/**
 * The Plan repository contract. Both the Supabase (online/web) class and the
 * offline SQLite class implement this — the compiler keeps the two in lockstep.
 */
export interface IPlanRepository {
  findAll(branchFilter?: BranchFilter): Promise<DbPlan[]>;
  create(payload: Omit<DbPlan, 'id' | 'created_at'>): Promise<DbPlan>;
  update(
    id: string,
    payload: Partial<
      Pick<DbPlan, 'name' | 'price' | 'is_custom_price' | 'duration_months' | 'currency_id' | 'branch_id'>
    >,
  ): Promise<DbPlan>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
}
