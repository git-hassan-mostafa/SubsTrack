import type { BranchFilter } from '@/src/core/constants';
import type { CashRow } from '@/src/core/types';
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

/**
 * Correcting a hand-over: the header's editable columns plus the COMPLETE new
 * split. Items are replaced wholesale — unlike sale_items there is no soft-void
 * here, because an item carries no history of its own (the collection does) and
 * `uq_collection_items_pair` makes a re-insert idempotent.
 */
export type UpdateCollectionPayload = Pick<
  DbCollection,
  'amount' | 'currency_id' | 'rate_per_usd_snapshot' | 'received_at' | 'notes'
> & {
  items: CreateCollectionItemPayload[];
  charges: CreateChargePayload[];
};

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
}

export interface ICollectionRepository {
  findById(id: string): Promise<DbCollection | null>;
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
  update(id: string, payload: UpdateCollectionPayload): Promise<DbCollection>;
  /** Un-applies every item at once, so all the balances it touched come back. */
  void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection>;

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
