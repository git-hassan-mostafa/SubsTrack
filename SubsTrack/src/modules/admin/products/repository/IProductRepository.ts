import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct, DbStockMovement } from '@/src/core/types/db';

/** A ledger row to append. `id`, timestamps and the void fields are filled in
 *  by the repository — a movement is never born voided. */
export type CreateStockMovementPayload = Omit<
  DbStockMovement,
  'id' | 'created_at' | 'updated_at' | 'voided_at' | 'voided_by'
>;

/** One stock purchase, for the Expenses view. Only positive, costed, live
 *  movements produce one; `amount` is quantity * unit_cost in the row's own
 *  currency, with the rate frozen when the stock was bought. */
export interface StockCostRow {
  movementId: string;
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  occurredAt: string;
  branchId: string | null;
  recordedByUserId: string | null;
}

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
      Pick<
        DbProduct,
        | 'name' | 'description' | 'price' | 'currency_id'
        | 'cost_price' | 'cost_currency_id' | 'branch_id' | 'active'
      >
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
  /** Stock bought in [start, endExclusive) — the derived half of the Expenses
   *  view. Branch comes from the parent product with OWNED semantics, so a
   *  shared product's purchase is a company expense, not every branch's. */
  stockCostsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<StockCostRow[]>;
}
