import type { BranchFilter } from '@/src/core/constants';
import type { DbService } from '@/src/core/types/db';

/**
 * The Service (price list) repository contract. Both the Supabase (online/web)
 * class and the offline SQLite class implement this — the compiler keeps the two
 * in lockstep.
 *
 * Deliberately the products contract MINUS the stock ledger: labour is not
 * stocked, so there is no `stockOnHand`, no movements, and no cost read for the
 * Expenses view. A service only ever brings money IN, through its sale line.
 */
export interface IServiceRepository {
  findAll(branchFilter?: BranchFilter): Promise<DbService[]>;
  create(payload: Omit<DbService, 'id' | 'created_at' | 'updated_at'>): Promise<DbService>;
  update(
    id: string,
    payload: Partial<
      Pick<DbService, 'name' | 'description' | 'price' | 'currency_id' | 'branch_id' | 'active'>
    >,
  ): Promise<DbService>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  /** The subset of `ids` that any sale line references — drives soft-vs-hard delete. */
  referencedIds(ids: string[]): Promise<Set<string>>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
  /** Sale lines referencing this service, INCLUDING ones an edit dropped: the
   *  server's `service_id` FK is ON DELETE RESTRICT, so a voided line still
   *  blocks a hard delete. */
  countReferences(id: string): Promise<number>;
}
