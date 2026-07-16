import type { DbBranch } from '@/src/core/types/db';

/**
 * The Branch repository contract. Both the Supabase (online/web) class and the
 * offline SQLite class implement this — the compiler keeps the two in lockstep.
 */
export interface IBranchRepository {
  findAll(): Promise<DbBranch[]>;
  create(payload: Omit<DbBranch, 'id' | 'created_at' | 'updated_at'>): Promise<DbBranch>;
  update(id: string, payload: Partial<Pick<DbBranch, 'name' | 'active'>>): Promise<DbBranch>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  referencedIds(ids: string[]): Promise<Set<string>>;
  countActive(): Promise<number>;
  countActiveAmong(ids: string[]): Promise<number>;
  countReferences(id: string): Promise<number>;
}
