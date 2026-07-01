import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct } from '@/src/core/types/db';

/**
 * The Product repository contract. Both the Supabase (online/web) class and the
 * offline SQLite class implement this — the compiler keeps the two in lockstep.
 */
export interface IProductRepository {
  findAll(branchFilter?: BranchFilter): Promise<DbProduct[]>;
  create(payload: Omit<DbProduct, 'id' | 'created_at' | 'updated_at'>): Promise<DbProduct>;
  update(
    id: string,
    payload: Partial<
      Pick<DbProduct, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbProduct>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  referencedIds(ids: string[]): Promise<Set<string>>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
  countReferences(id: string): Promise<number>;
}
