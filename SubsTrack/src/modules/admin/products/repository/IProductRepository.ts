import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct, DbStockMovement } from '@/src/core/types/db';

/** A ledger row to append. `id`, timestamps and the void fields are filled in
 *  by the repository — a movement is never born voided. */
export type CreateStockMovementPayload = Omit<
  DbStockMovement,
  'id' | 'created_at' | 'updated_at' | 'voided_at' | 'voided_by'
>;

/** The columns a correction may touch. Everything else is what the movement IS —
 *  its product, its date, its reason — and a change there is a different event.
 *  The cost trio still travels together (ProductService builds it). */
export type UpdateStockMovementPayload = Pick<
  DbStockMovement,
  'quantity_delta' | 'unit_cost' | 'currency_id' | 'rate_per_usd_snapshot' | 'note'
>;

/** One stock purchase, for the Expenses view. Every costed, live, non-sale
 *  movement produces one; `amount` is quantity * unit_cost in the row's own
 *  currency, with the rate frozen when the stock was bought. **Both are signed**
 *  — a costed removal (wrong entry, returned stock) carries a negative quantity
 *  and amount, so it subtracts from the expenses. */
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

  stockOnHand(productIds?: string[]): Promise<Record<string, number>>;
  addMovements(payloads: CreateStockMovementPayload[]): Promise<void>;
  findMovement(id: string): Promise<DbStockMovement | null>;
  updateMovement(id: string, payload: UpdateStockMovementPayload): Promise<DbStockMovement>;
  voidMovement(id: string, voidedBy: string | null): Promise<DbStockMovement>;
  movementsForProduct(productId: string, limit?: number): Promise<DbStockMovement[]>;
  stockCostsInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<StockCostRow[]>;
}
