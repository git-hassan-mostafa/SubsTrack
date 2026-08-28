import type { BranchFilter } from '@/src/core/constants';
import type { DbSale, DbSaleItem } from '@/src/core/types/db';
import type { CreateStockMovementPayload } from '@/src/modules/admin/products';
import type {
  CreateChargePayload,
  UpdateChargePayload,
} from '@/src/modules/ledger/repository/IChargeRepository';
import type { FindSalesOptions } from '../utils/types';

// The bill a sale raises, minus the one column the repository fills in — the
// sale's id, which does not exist until the header is inserted. Exactly the
// same contract as `sale_id` on an item or a movement.
export type SaleChargePayload = Omit<CreateChargePayload, 'sale_id'>;

// One line of the sale to create — product or service. `sale_id` is filled in by
// the repository, and a line is never born voided. Built by
// `utils/saleLines.toItemPayload`, the one place that decides which id column a
// line sets.
export type CreateSaleItemPayload = Omit<
  DbSaleItem,
  'id' | 'sale_id' | 'voided_at' | 'created_at' | 'updated_at' | 'products' | 'services'
>;

// Sale header to create + its lines + the stock decrements they cause.
// `total_amount` and `items_summary` are computed by the service (total_amount
// is app-written, not generated). `movements` travels with the sale so that
// offline the whole thing lands in ONE transaction — a sale can never exist
// without the stock it consumed. `sale_id` on each movement is filled by the
// repository, like `sale_id` on each item. It is EMPTY for a service-only sale:
// labour comes off no shelf.
export type CreateSalePayload = Omit<
  DbSale,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'voided_at'
  | 'voided_by'
  | 'void_reason'
  | 'sale_items'
  | 'customers'
> & {
  items: CreateSaleItemPayload[];
  movements: Omit<CreateStockMovementPayload, 'sale_id'>[];
  // What the sale OWES. It travels with the header for the same reason the
  // movements do — offline the whole thing is one transaction, so a sale can
  // never exist without the bill that makes it collectable. Money received is
  // NOT here: that is a `collections` row, written by the normal collect path.
  charge: SaleChargePayload;
};

// Correction of an existing, non-voided sale: the header's editable columns plus
// the COMPLETE new line set (`items` replaces what is there — lines are matched
// to the existing rows by position, so an id survives an edit wherever it can and
// only a dropped line is soft-voided).
//
// `movements` is the complete replacement stock ledger for the sale, or **null**
// meaning "the products and quantities did not change, leave the ledger alone" —
// without that, fixing a typo in the notes would litter every product's stock
// history with a void + re-add pair.
export type UpdateSalePayload = Pick<
  DbSale,
  | 'branch_id'
  | 'items_summary'
  | 'customer_id'
  | 'total_amount'
  | 'currency_id'
  | 'rate_per_usd_snapshot'
  | 'notes'
> & {
  items: CreateSaleItemPayload[];
  movements: Omit<CreateStockMovementPayload, 'sale_id'>[] | null;
  // The bill follows the sale: re-pricing a sale re-prices what is owed for it,
  // in the same write. Money already collected against it is untouched.
  charge: UpdateChargePayload;
  // Who is correcting the sale — stamped on the movements this edit voids.
  actorUserId: string | null;
};

export interface ISaleRepository {
  findAll(opts?: FindSalesOptions): Promise<DbSale[]>;
  findByCustomer(customerId: string, limit?: number): Promise<DbSale[]>;
  findById(id: string): Promise<DbSale | null>;
  create(payload: CreateSalePayload): Promise<DbSale>;
  // Voided sales stay locked — both impls filter on `voided_at IS NULL`.
  update(id: string, payload: UpdateSalePayload): Promise<DbSale>;
  // Voids the sale AND the bill it raised — nothing may still be owed for a
  // sale that never happened. The service refuses this once money has been
  // collected against that bill (void the collection first).
  voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale>;
  // Same filters as findAll but unpaginated + a lean projection (no product/
  // customer joins) — computes the true per-month total for the Sales tab's
  // section headers even when a month holds more rows than one findAll page.
  // This is VALUE SOLD (total_amount), not cash: the sale document no longer
  // holds money — what was collected is a `collections` row.
  monthlyTotals(
    opts?: FindSalesOptions,
  ): Promise<{ soldAt: string; amount: number; ratePerUsdSnapshot: number }[]>;
  // How many sales happened in a window — the dashboard's activity count. Not a
  // money figure: cash lives on `collections` now, but a sale is still an event.
  countInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter?: BranchFilter,
  ): Promise<number>;
}
