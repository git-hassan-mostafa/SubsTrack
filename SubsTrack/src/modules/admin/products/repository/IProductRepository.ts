import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct, DbStockMovement } from '@/src/core/types/db';

/** A ledger row to append. `id`, timestamps and the void fields are filled in
 *  by the repository — a movement is never born voided. */
export type CreateStockMovementPayload = Omit<
  DbStockMovement,
  'id' | 'created_at' | 'updated_at' | 'voided_at' | 'voided_by'
>;

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

  // ── Stock ledger ───────────────────────────────────────────────────────────
  /** Stock on hand per product id: SUM over non-voided rows. Products with no
   *  movements are absent from the map (the caller defaults them to 0). */
  stockOnHand(productIds?: string[]): Promise<Record<string, number>>;
  /** Append 1..N ledger rows — one call so a sale's lines land together. */
  addMovements(payloads: CreateStockMovementPayload[]): Promise<void>;
  /** Newest first, voided rows included so the history shows corrections. */
  movementsForProduct(productId: string, limit?: number): Promise<DbStockMovement[]>;
}
