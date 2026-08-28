import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { CollectedRow } from '@/src/core/types';
import type { DbCollection, DbCollectionItem } from '@/src/core/types/db';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type {
  CreateCollectionPayload,
  FindCollectionsOptions,
  ICollectionRepository,
  UpdateCollectionPayload,
} from './ICollectionRepository';
import { OfflineCollectionRepository } from './CollectionRepository.offline';

// A hand-over with its split and the bill each line paid — everything a receipt
// or a history row needs in one read.
const COLLECTION_SELECT = '*, collection_items(*, charges(*)), customers(*)';
const COLLECTION_SELECT_LEAN = '*, customers(*)';

export class CollectionRepository extends BaseRepository implements ICollectionRepository {
  async findById(id: string): Promise<DbCollection | null> {
    const { data, error } = await this.db
      .from('collections')
      .select(COLLECTION_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data as DbCollection) ?? null;
  }

  async find(opts: FindCollectionsOptions): Promise<DbCollection[]> {
    const limit = opts.limit ?? PAGE_SIZE;
    const offset = opts.offset ?? 0;
    let query = this.db
      .from('collections')
      .select(COLLECTION_SELECT)
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!opts.includeVoided) query = query.is('voided_at', null);
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.heldByUserId) query = query.eq('held_by_user_id', opts.heldByUserId);
    if (opts.startIso) query = query.gte('received_at', opts.startIso);
    if (opts.endExclusiveIso) query = query.lt('received_at', opts.endExclusiveIso);
    if (opts.searchTerm?.trim()) {
      query = query.or(`customers.name.ilike.%${opts.searchTerm.trim()}%`);
    }
    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.collections);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async findItemsForCharges(chargeIds: string[]): Promise<DbCollectionItem[]> {
    if (chargeIds.length === 0) return [];
    const { data, error } = await this.db
      .from('collection_items')
      .select('*, collections!inner(*)')
      .in('charge_id', chargeIds)
      // A voided hand-over paid nothing — its lines must not show as payments.
      .is('collections.voided_at', null);
    if (error) this.handleError(error);
    return (data ?? []) as DbCollectionItem[];
  }

  async create(payload: CreateCollectionPayload): Promise<DbCollection> {
    const { items, charges, ...header } = payload;

    // The bills must exist before anything can point at them. Upserted by their
    // deterministic id, so a month another device already billed is reused
    // rather than duplicated — and keeps ITS frozen price.
    if (charges.length > 0) {
      const { error } = await this.db
        .from('charges')
        .upsert(charges, { onConflict: 'id', ignoreDuplicates: true });
      if (error) this.handleError(error);
    }

    const { data, error } = await this.db
      .from('collections')
      // The cash starts in the receiving user's wallet.
      .insert({ ...header, held_by_user_id: header.received_by_user_id })
      .select(COLLECTION_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const created = data as DbCollection;

    const { error: itemsError } = await this.db
      .from('collection_items')
      .insert(items.map((it) => ({ ...it, collection_id: created.id })));
    if (itemsError) this.handleError(itemsError);

    // One entry for the hand-over as a whole — the split rides in after_data, so
    // the trail literally reads "55 → 20 Jan, 20 Feb, 15 Sale #13".
    this.audit({
      table: 'collections',
      recordId: created.id,
      action: 'create',
      after: { ...created, collection_items: items },
      branchId: created.branch_id,
      customerId: created.customer_id ?? undefined,
      subject: created.customers?.name ?? null,
    });

    return (await this.findById(created.id)) ?? created;
  }

  async update(id: string, payload: UpdateCollectionPayload): Promise<DbCollection> {
    const { items, charges, ...header } = payload;
    const prior = await this.findById(id);

    if (charges.length > 0) {
      const { error } = await this.db
        .from('charges')
        .upsert(charges, { onConflict: 'id', ignoreDuplicates: true });
      if (error) this.handleError(error);
    }

    const { error } = await this.db.from('collections').update(header).eq('id', id);
    if (error) this.handleError(error);

    // The split is replaced wholesale. Unlike sale_items there is no soft-void:
    // an item carries no history of its own (the collection does), so a delete
    // loses nothing — and the sync engine has no tombstones for it either, which
    // is why the delete is logged through the normal repository path.
    const { error: delError } = await this.db.from('collection_items').delete().eq('collection_id', id);
    if (delError) this.handleError(delError);
    const { error: insError } = await this.db
      .from('collection_items')
      .insert(items.map((it) => ({ ...it, collection_id: id })));
    if (insError) this.handleError(insError);

    const after = await this.findById(id);
    this.audit({
      table: 'collections',
      recordId: id,
      action: 'update',
      before: prior,
      after,
      branchId: after?.branch_id ?? null,
      subject: after?.customers?.name ?? null,
    });
    return after!;
  }

  /**
   * Voiding the header un-applies every item at once, so all the balances it
   * touched come back with nothing to recompute. The items themselves are left
   * alone — they are the record of what the money HAD paid.
   */
  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection> {
    const prior = await this.findById(id);
    const { data, error } = await this.db
      .from('collections')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
      // Makes a repeat void a no-op rather than restamping it.
      .is('voided_at', null)
      .select(COLLECTION_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const voided = data as DbCollection;
    this.audit({
      table: 'collections',
      recordId: id,
      action: 'void',
      before: prior,
      after: voided,
      branchId: voided.branch_id,
      subject: voided.customers?.name ?? null,
    });
    return voided;
  }

  // ── Money in ──────────────────────────────────────────────────────────────

  async collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CollectedRow[]> {
    let query = this.db
      .from('collections')
      .select('*, customers(name)')
      .is('voided_at', null)
      .gte('received_at', startIso)
      .lt('received_at', endExclusiveIso);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.collections);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []).map((r: DbCollection) => ({
      id: r.id,
      date: r.received_at,
      amount: r.amount,
      currencyId: r.currency_id,
      ratePerUsdSnapshot: r.rate_per_usd_snapshot,
      branchId: r.branch_id,
      receivedByUserId: r.received_by_user_id,
      customerId: r.customer_id,
      customerName: r.customers?.name ?? null,
      planId: null,
      label: r.notes,
    }));
  }

  async collectedByKindInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<Record<'month' | 'sale' | 'manual', number>> {
    // Split the SAME money by what each line PAID FOR, so a partly-paid sale
    // finally lands in the right bucket instead of the whole payment doing so.
    let query = this.db
      .from('collection_items')
      .select('amount, charges!inner(kind), collections!inner(received_at, voided_at, rate_per_usd_snapshot, branch_id, customer_id)')
      .is('collections.voided_at', null)
      .gte('collections.received_at', startIso)
      .lt('collections.received_at', endExclusiveIso);
    query = this.applyBranchFilter(query, branchFilter, {
      kind: 'inherited',
      joinedTable: 'collections',
    });
    const { data, error } = await query;
    if (error) this.handleError(error);

    const totals = { month: 0, sale: 0, manual: 0 };
    for (const row of (data ?? []) as unknown as {
      amount: number;
      charges: { kind: 'month' | 'sale' | 'manual' };
      collections: { rate_per_usd_snapshot: number };
    }[]) {
      totals[row.charges.kind] += row.amount / row.collections.rate_per_usd_snapshot;
    }
    return totals;
  }

  // ── Collector wallet ──────────────────────────────────────────────────────

  async findHeld(userId: string, branchFilter: BranchFilter): Promise<DbCollection[]> {
    let query = this.db
      .from('collections')
      .select(COLLECTION_SELECT_LEAN)
      .eq('held_by_user_id', userId)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.collections);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async findAllHeld(branchFilter: BranchFilter): Promise<DbCollection[]> {
    let query = this.db
      .from('collections')
      .select(COLLECTION_SELECT_LEAN)
      .not('held_by_user_id', 'is', null)
      .is('voided_at', null);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.collections);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from('collections')
      .update(custodyValues(toUserId, actorUserId))
      .in('id', ids)
      // Guarded on the SOURCE wallet so two admins racing on the same rows
      // cannot both take them.
      .eq('held_by_user_id', fromUserId);
    if (error) this.handleError(error);
  }
}

export default Platform.OS === 'web'
  ? new CollectionRepository()
  : new OfflineCollectionRepository();
