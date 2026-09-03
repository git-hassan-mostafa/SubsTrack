import type { BranchFilter } from '@/src/core/constants';
import type { CashRow, WalletSource } from '@/src/core/types';
import type { DbCollection, DbCollectionItem } from '@/src/core/types/db';
import type { CreateChargePayload } from './IChargeRepository';

/** One line of the split. `collection_id` is filled in by the repository. */
export type CreateCollectionItemPayload = Omit<
  DbCollectionItem,
  'id' | 'collection_id' | 'created_at' | 'updated_at' | 'charges'
>;

/**
 * A hand-over of cash plus where it went.
 *
 * `charges` carries the bills that must EXIST before the items can point at
 * them — the month charges the waterfall just materialized. They travel with
 * the collection so that offline the whole thing lands in ONE transaction: cash
 * can never be recorded against a bill that failed to save. Each is upserted by
 * its deterministic id, so a bill another device already created is reused.
 */
export type CreateCollectionPayload = Omit<
  DbCollection,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'voided_at'
  | 'voided_by'
  | 'void_reason'
  // The repository seeds held_by_user_id from received_by_user_id.
  | 'held_by_user_id'
  | 'remitted_at'
  | 'remitted_by'
  | 'collection_items'
  | 'customers'
> & {
  items: CreateCollectionItemPayload[];
  charges: CreateChargePayload[];
};

export type SortDirection = 'desc' | 'asc';

export type CollectionSortField = 'received_at' | 'created_at' | 'updated_at';

export interface FindCollectionsOptions {
  customerId?: string;
  branchFilter?: BranchFilter;
  heldByUserId?: string;
  receivedByUserId?: string;
  startIso?: string;
  endExclusiveIso?: string;
  limit?: number;
  offset?: number;
  searchTerm?: string;
  includeVoided?: boolean;
  kind?: WalletSource;
  voidedOnly?: boolean;
  sortField?: CollectionSortField;
  sortDirection?: SortDirection;
}

export interface ICollectionRepository {
  findById(id: string): Promise<DbCollection | null>;
  /** Several hand-overs with their splits, in ONE read - a bill's payments. */
  findByIds(ids: string[]): Promise<DbCollection[]>;
  find(opts: FindCollectionsOptions): Promise<DbCollection[]>;
  /** The items settling these bills — powers a bill's own payments list. */
  findItemsForCharges(chargeIds: string[]): Promise<DbCollectionItem[]>;
  /**
   * "YYYY-MM" → USD, over EVERY row matching the filters (not just the loaded
   * page), so the history's section headers show a true month total. Voided
   * rows are excluded — they are shown in the list but count for nothing.
   */
  monthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>>;

  create(payload: CreateCollectionPayload): Promise<DbCollection>;
  /** Un-applies every item at once, so all the balances it touched come back. */
  void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection>;
  /**
   * The same, for many hand-overs in ONE write — what voiding a whole bill or a
   * paid sale needs. Not a loop over `void`: that costs a read, a write and a
   * transaction each, which is what made voiding a paid record slow.
   *
   * Returns only the rows this call actually voided (an already-voided one is
   * skipped, not an error — the right answer for a multi-select), and they are
   * **not hydrated**: no `collection_items`, no charges, no customer. Callers
   * want to know *what* was voided; loading joins nobody reads would undo the
   * batching. Re-read through `find`/`findById` if a full row is needed.
   */
  voidMany(ids: string[], voidedBy: string, reason: string | null): Promise<DbCollection[]>;

  // ── Money in ──────────────────────────────────────────────────────────────
  /**
   * Cash that ARRIVED in a window, ONE ROW PER BILL IT SETTLED and tagged with
   * what that bill was.
   *
   * The three old streams (payments, sales, debt payments) are one table now,
   * so nothing merges anything; and because the split is by BILL rather than by
   * hand-over, a payment against a sale debt finally counts as sales revenue.
   */
  collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]>;

  // ── Collector wallet ──────────────────────────────────────────────────────
  /** Cash a user is holding right now. */
  findHeld(userId: string, branchFilter: BranchFilter): Promise<DbCollection[]>;
  /** Every wallet's holdings in scope — the Wallets screen. */
  findAllHeld(branchFilter: BranchFilter): Promise<DbCollection[]>;
  /**
   * Move cash up the custody chain. Guarded on `fromUserId` so two admins
   * racing on the same rows cannot both take them.
   */
  transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void>;
}
