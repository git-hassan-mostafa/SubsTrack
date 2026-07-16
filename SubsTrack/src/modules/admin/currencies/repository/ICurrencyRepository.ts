import type { DbCurrency } from '@/src/core/types/db';

/**
 * The Currency repository contract. Both the Supabase (online/web) class and the
 * offline SQLite class implement this — the compiler keeps the two in lockstep.
 */
export interface ICurrencyRepository {
  findAll(): Promise<DbCurrency[]>;
  create(payload: Omit<DbCurrency, 'id' | 'created_at' | 'updated_at'>): Promise<DbCurrency>;
  update(
    id: string,
    payload: Partial<
      Pick<DbCurrency, 'code' | 'name' | 'symbol' | 'rate_per_usd' | 'decimals' | 'active'>
    >,
  ): Promise<DbCurrency>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  referencedIds(ids: string[]): Promise<Set<string>>;
  countReferences(id: string): Promise<number>;
}
