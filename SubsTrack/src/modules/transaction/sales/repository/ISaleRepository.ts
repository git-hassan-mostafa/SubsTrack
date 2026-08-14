import type { BranchFilter } from '@/src/core/constants';
import type { DbSale, DbSaleItem } from '@/src/core/types/db';
import type { CreateStockMovementPayload } from '@/src/modules/admin/products';
import type { FindSalesOptions } from '../utils/types';

// One line of the sale to create. `sale_id` is filled in by the repository.
export type CreateSaleItemPayload = Omit<
  DbSaleItem,
  'id' | 'sale_id' | 'created_at' | 'updated_at' | 'products'
>;

// Sale header to create + its product lines + the stock decrements they cause.
// `total_amount` and `items_summary` are computed by the service (total_amount
// is app-written, not generated). `movements` travels with the sale so that
// offline the whole thing lands in ONE transaction — a sale can never exist
// without the stock it consumed. `sale_id` on each movement is filled by the
// repository, like `sale_id` on each item.
export type CreateSalePayload = Omit<
  DbSale,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'voided_at'
  | 'voided_by'
  | 'void_reason'
  // Custody columns: the repository seeds held_by_user_id from
  // recorded_by_user_id, so a caller never supplies them.
  | 'held_by_user_id'
  | 'remitted_at'
  | 'remitted_by'
  | 'sale_items'
  | 'customers'
> & {
  items: CreateSaleItemPayload[];
  movements: Omit<CreateStockMovementPayload, 'sale_id'>[];
};

export interface ISaleRepository {
  findAll(opts?: FindSalesOptions): Promise<DbSale[]>;
  findByCustomer(customerId: string, limit?: number): Promise<DbSale[]>;
  findById(id: string): Promise<DbSale | null>;
  create(payload: CreateSalePayload): Promise<DbSale>;
  voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale>;
  // Revenue is CASH: every total below sums `amount_paid`, never `total_amount`.
  // The unpaid part of a partial sale is a debt, and it enters revenue only when
  // it's collected as a debt payment. Row count is still every sale (salesCount).
  totalsForMonth(
    monthStart: string,
    monthEndExclusive: string,
    branchFilter?: BranchFilter,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]>;
  // Cash collected on sales across a date range, each tagged with sold_at — the
  // dashboard buckets these by month into the revenue trend.
  totalsInRange(
    rangeStart: string,
    rangeEndExclusive: string,
    branchFilter?: BranchFilter,
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]>;
  // Same filters as findAll but unpaginated + a lean projection (no product/
  // customer joins) — computes the true per-month total for the Sales tab's
  // section headers even when a month holds more rows than one findAll page.
  monthlyTotals(
    opts?: FindSalesOptions,
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]>;
  // Non-voided sales tied to a customer that still owe money
  // (total_amount > amount_paid), across all time — the "Sales" debt category.
  // Joined with the customer for display.
  partialSales(branchFilter?: BranchFilter): Promise<DbSale[]>;
  // Collector wallet: non-voided sales someone is holding (held_by_user_id IS
  // NOT NULL) with cash collected (amount_paid > 0). Optionally scoped to one
  // holder.
  heldForWallet(branchFilter?: BranchFilter, holderUserId?: string | null): Promise<DbSale[]>;
  // Move the given sales' cash to the next holder. See
  // IPaymentRepository.transferCustody — same contract.
  transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void>;
}
