import type { BranchFilter } from '@/src/core/constants';
import type { DbSale, DbSaleItem } from '@/src/core/types/db';
import type { FindSalesOptions } from '../utils/types';

// One line of the sale to create. `sale_id` is filled in by the repository.
export type CreateSaleItemPayload = Omit<
  DbSaleItem,
  'id' | 'sale_id' | 'created_at' | 'updated_at' | 'products'
>;

// Sale header to create + its product lines. `total_amount` and `items_summary`
// are computed by the service (total_amount is app-written, not generated).
export type CreateSalePayload = Omit<
  DbSale,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'voided_at'
  | 'voided_by'
  | 'void_reason'
  | 'remitted_at'
  | 'remitted_by'
  | 'sale_items'
  | 'customers'
> & { items: CreateSaleItemPayload[] };

export interface ISaleRepository {
  findAll(opts?: FindSalesOptions): Promise<DbSale[]>;
  findByCustomer(customerId: string, limit?: number): Promise<DbSale[]>;
  findById(id: string): Promise<DbSale | null>;
  create(payload: CreateSalePayload): Promise<DbSale>;
  voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale>;
  totalsForMonth(
    monthStart: string,
    monthEndExclusive: string,
    branchFilter?: BranchFilter,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]>;
  // Sale totals across a date range, each tagged with sold_at — the dashboard
  // buckets these by month into the revenue trend.
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
  // Collector wallet: non-voided sales still in a wallet (remitted_at IS NULL)
  // with cash collected (amount_paid > 0). Optionally scoped to one recorder.
  unremittedForWallet(
    branchFilter?: BranchFilter,
    collectorUserId?: string | null,
  ): Promise<DbSale[]>;
  // Stamp the given sales as handed over (remitted) by an admin. Ignores rows
  // already remitted or voided.
  markRemitted(ids: string[], remittedBy: string): Promise<void>;
}
