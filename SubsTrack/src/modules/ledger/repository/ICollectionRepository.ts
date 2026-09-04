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
  findByIds(ids: string[]): Promise<DbCollection[]>;
  find(opts: FindCollectionsOptions): Promise<DbCollection[]>;
  findItemsForCharges(chargeIds: string[]): Promise<DbCollectionItem[]>;
  monthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>>;

  create(payload: CreateCollectionPayload): Promise<DbCollection>;
  void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection>;
  voidMany(ids: string[], voidedBy: string, reason: string | null): Promise<DbCollection[]>;

  collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]>;

  findHeld(userId: string, branchFilter: BranchFilter): Promise<DbCollection[]>;
  findAllHeld(branchFilter: BranchFilter): Promise<DbCollection[]>;
  transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void>;
}
