import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { CashRow, CashStream } from '@/src/core/types';
import type { DbCharge, DbCollection, DbCollectionItem } from '@/src/core/types/db';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type {
  CreateCollectionPayload,
  FindCollectionsOptions,
  ICollectionRepository,
} from './ICollectionRepository';
import { OfflineCollectionRepository } from './CollectionRepository.offline';
import { sumByMonth } from '../utils/monthTotals';

// A hand-over with its split and the bill each line paid — everything a receipt
// or a history row needs in one read.
const COLLECTION_SELECT = '*, collection_items(*, charges(*)), customers(*)';

// The joined shape `collectedInRange` reads — one settled bill plus the
// hand-over it came in on.
interface CollectedItemRow {
  id: string;
  amount: number;
  charges: {
    kind: CashStream;
    plan_id: string | null;
    description: string | null;
    billing_month: string | null;
  };
  collections: {
    id: string;
    received_at: string;
    currency_id: string | null;
    rate_per_usd_snapshot: number;
    branch_id: string | null;
    received_by_user_id: string | null;
    customer_id: string | null;
    notes: string | null;
    customers?: { name: string } | null;
  };
}

function toCashRow(r: CollectedItemRow): CashRow {
  const c = r.collections;
  return {
    id: r.id,
    collectionId: c.id,
    date: c.received_at,
    amount: Number(r.amount),
    // The CURRENCY and RATE come from the hand-over, not the bill: they are
    // what the money physically was, and a collection is single-currency.
    currencyId: c.currency_id,
    ratePerUsdSnapshot: Number(c.rate_per_usd_snapshot),
    branchId: c.branch_id,
    receivedByUserId: c.received_by_user_id,
    customerId: c.customer_id,
    customerName: c.customers?.name ?? null,
    planId: r.charges.plan_id,
    label: r.charges.description ?? r.charges.billing_month ?? c.notes,
    stream: r.charges.kind,
  };
}
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
      // created_at breaks the tie: a back-dated hand-over (and every row
      // written before received_at carried a time of day) lands at noon, so
      // without it same-day rows come back in arbitrary order.
      .order('received_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!opts.includeVoided) query = query.is('voided_at', null);
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.heldByUserId) query = query.eq('held_by_user_id', opts.heldByUserId);
    if (opts.receivedByUserId) query = query.eq('received_by_user_id', opts.receivedByUserId);
    if (opts.startIso) query = query.gte('received_at', opts.startIso);
    if (opts.endExclusiveIso) query = query.lt('received_at', opts.endExclusiveIso);
    if (opts.searchTerm?.trim()) {
      query = query.ilike('customers.name', `%${opts.searchTerm.trim()}%`);
    }
    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.collections);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async monthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>> {
    // Three numeric columns, unpaginated — cheap, and the only way a section
    // header can show the month's real total rather than the loaded page's.
    let query = this.db
      .from('collections')
      .select('received_at, amount, rate_per_usd_snapshot, customers!inner(name, branch_id)')
      .is('voided_at', null);

    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.heldByUserId) query = query.eq('held_by_user_id', opts.heldByUserId);
    if (opts.receivedByUserId) query = query.eq('received_by_user_id', opts.receivedByUserId);
    if (opts.startIso) query = query.gte('received_at', opts.startIso);
    if (opts.endExclusiveIso) query = query.lt('received_at', opts.endExclusiveIso);
    if (opts.searchTerm?.trim()) {
      query = query.ilike('customers.name', `%${opts.searchTerm.trim()}%`);
    }
    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.collections);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return sumByMonth(
      (data as unknown as { received_at: string; amount: number; rate_per_usd_snapshot: number }[] | null) ?? [],
    );
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
      const { data: inserted, error } = await this.db
        .from('charges')
        .upsert(charges, { onConflict: 'id', ignoreDuplicates: true })
        .select();
      if (error) this.handleError(error);
      // Only the rows this device actually raised — `ignoreDuplicates` returns
      // nothing for a bill another device had already billed, which is exactly
      // the set that should NOT get a second create entry.
      for (const row of (inserted ?? []) as DbCharge[]) {
        this.audit({
          table: 'charges',
          recordId: row.id,
          action: 'create',
          after: row,
          branchId: row.branch_id,
          customerId: row.customer_id ?? undefined,
        });
      }
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

  /**
   * Void many hand-overs in one round trip pair: one read for the priors the
   * audit needs, one UPDATE over them all. A loop over `void()` costs three
   * calls each, which is what made voiding a paid bill or sale slow.
   */
  async voidMany(
    ids: string[],
    voidedBy: string,
    reason: string | null,
  ): Promise<DbCollection[]> {
    if (ids.length === 0) return [];
    const { data: priors } = await this.db
      .from('collections')
      .select(COLLECTION_SELECT_LEAN)
      .in('id', ids);
    const priorById = new Map(((priors ?? []) as DbCollection[]).map((c) => [c.id, c]));
    const { data, error } = await this.db
      .from('collections')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .in('id', ids)
      // Same guard as `void`: a repeat void is a no-op, not a restamp.
      .is('voided_at', null)
      .select(COLLECTION_SELECT_LEAN);
    if (error) this.handleError(error);
    const voided = (data ?? []) as DbCollection[];
    // One entry per row still — the trail is per record, only the writes batch.
    // `audit()` is detached, so these add nothing to the critical path.
    for (const row of voided) {
      this.audit({
        table: 'collections',
        recordId: row.id,
        action: 'void',
        before: priorById.get(row.id),
        after: row,
        branchId: row.branch_id,
        subject: row.customers?.name ?? null,
      });
    }
    return voided;
  }

  // ── Money in ──────────────────────────────────────────────────────────────

  async collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    // Read from the ITEM side: one row per bill settled, tagged with what that
    // bill was. A hand-over that closed a month AND a sale becomes two rows, so
    // every breakdown is one pass and each drill-down adds up to the number
    // above it. The header always equals the sum of its items, so the grand
    // total is unchanged.
    let query = this.db
      .from('collection_items')
      .select(
        'id, amount, charges!inner(kind, plan_id, description, billing_month), ' +
          'collections!inner(id, received_at, currency_id, rate_per_usd_snapshot, branch_id, ' +
          'received_by_user_id, customer_id, notes, voided_at, customers(name))',
      )
      .is('collections.voided_at', null)
      .gte('collections.received_at', startIso)
      .lt('collections.received_at', endExclusiveIso);
    query = this.applyBranchFilter(query, branchFilter, {
      ...this.BRANCH_SCOPES.collections,
      kind: 'inherited',
      joinedTable: 'collections',
    });
    const { data, error } = await query;
    if (error) this.handleError(error);
    return ((data ?? []) as unknown as CollectedItemRow[]).map(toCashRow);
  }

  // ── Collector wallet ──────────────────────────────────────────────────────

  async findHeld(userId: string, branchFilter: BranchFilter): Promise<DbCollection[]> {
    // The FULL select, matching the offline read: a wallet row names what the
    // money settled, which lives on the items.
    let query = this.db
      .from('collections')
      .select(COLLECTION_SELECT)
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
      .select(COLLECTION_SELECT)
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
