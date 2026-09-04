import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { CashRow, CashStream } from '@/src/core/types';
import type { DbCharge, DbCollection, DbCollectionItem } from '@/src/core/types/db';
import { sanitizeSearchTerm } from '@/src/core/utils/searchTerm';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type {
  CreateCollectionPayload,
  FindCollectionsOptions,
  ICollectionRepository,
} from './ICollectionRepository';
import type { CreateChargePayload } from './IChargeRepository';
import { isDeadBill, revivePatch, samePrice } from './chargeRevive';
import { OfflineCollectionRepository } from './CollectionRepository.offline';
import { sumByMonth } from '../utils/monthTotals';

// A hand-over with its split and the bill each line paid — everything a receipt
// or a history row needs in one read.
const COLLECTION_SELECT = '*, collection_items(*, charges(*)), customers(*)';
// Only while a search term is on: an `ilike` on a plain embed filters the
// embedded rows, so the parent list comes back whole — see `find`.
const COLLECTION_SELECT_SEARCH = '*, collection_items(*, charges(*)), customers!inner(*)';

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

  async findByIds(ids: string[]): Promise<DbCollection[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from('collections')
      .select(COLLECTION_SELECT)
      .in('id', ids);
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async find(opts: FindCollectionsOptions): Promise<DbCollection[]> {
    const limit = opts.limit ?? PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const search = sanitizeSearchTerm(opts.searchTerm);
    const asc = opts.sortDirection === 'asc';
    const sortField = opts.sortField ?? 'received_at';
    let query = this.db
      .from('collections')
      .select(search ? COLLECTION_SELECT_SEARCH : COLLECTION_SELECT)
      .order(sortField, { ascending: asc });
    if (sortField !== 'created_at') query = query.order('created_at', { ascending: asc });
    query = query.range(offset, offset + limit - 1);

    if (!opts.includeVoided) query = query.is('voided_at', null);
    if (opts.voidedOnly) query = query.not('voided_at', 'is', null);
    if (opts.kind) query = query.eq('kind', opts.kind);
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.heldByUserId) query = query.eq('held_by_user_id', opts.heldByUserId);
    if (opts.receivedByUserId) query = query.eq('received_by_user_id', opts.receivedByUserId);
    if (opts.startIso) query = query.gte('received_at', opts.startIso);
    if (opts.endExclusiveIso) query = query.lt('received_at', opts.endExclusiveIso);
    if (search) query = query.ilike('customers.name', `%${search}%`);
    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.collections);

    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async monthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>> {
    if (opts.voidedOnly) return {};
    // Three numeric columns, unpaginated — cheap, and the only way a section
    // header can show the month's real total rather than the loaded page's.
    const search = sanitizeSearchTerm(opts.searchTerm);
    let query = this.db
      .from('collections')
      // The customer join exists ONLY for the search — `collections` owns its
      // branch_id, so scoping never needs it. Joined `!inner` unconditionally,
      // it silently dropped every walk-in sale's cash (customer_id IS NULL)
      // from the section-header totals while the rows beneath still listed it.
      .select(
        search
          ? 'received_at, amount, rate_per_usd_snapshot, customers!inner(name)'
          : 'received_at, amount, rate_per_usd_snapshot',
      )
      .is('voided_at', null);

    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.heldByUserId) query = query.eq('held_by_user_id', opts.heldByUserId);
    if (opts.receivedByUserId) query = query.eq('received_by_user_id', opts.receivedByUserId);
    if (opts.startIso) query = query.gte('received_at', opts.startIso);
    if (opts.endExclusiveIso) query = query.lt('received_at', opts.endExclusiveIso);
    if (opts.kind) query = query.eq('kind', opts.kind);
    if (search) query = query.ilike('customers.name', `%${search}%`);
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

  /**
   * Make the bills money is about to land on valid targets for it. TWO
   * INDEPENDENT steps, and keeping them independent is the whole point:
   *
   *  1. REVIVE. A month's `(customer_plan_id, billing_month)` key is unique
   *     whatever the row's state, so a voided or written-off bill is the only
   *     row that month can ever have — the upsert below skips it and the split
   *     points straight at it. But every read (the grid, the debts screen,
   *     `charge_balances`) drops a dead bill, so the cash is saved and then
   *     invisible. Money contradicts both a void ("a mistake") and a write-off
   *     ("never going to be paid"), so both are cleared UNCONDITIONALLY. This
   *     used to be bundled into step 2 and was skipped whenever the price had
   *     not moved — which is exactly how it went wrong (gotcha #115).
   *
   *  2. RE-PRICE. An EMPTY month bill keeps its row (it is the natural key) but
   *     may not keep its amount: the caller already re-priced the item from the
   *     line's current price, so the stored row follows (gotcha #106b). Guarded
   *     on `paid = 0`, never on "was voided" — the same money-not-a-row rule,
   *     and it also makes the write safe if another device collected meanwhile.
   */
  private async reviveTargetBills(
    charges: CreateChargePayload[],
  ): Promise<Map<string, DbCharge>> {
    // Returned so the caller can assemble its own result: these are bills the
    // split points at, and the split has to carry them (#119).
    const current = new Map<string, DbCharge>();
    if (charges.length === 0) return current;

    const { data: existing, error } = await this.db
      .from('charges')
      .select('*')
      .in('id', charges.map((c) => c.id));
    if (error) this.handleError(error);

    const rows = (existing ?? []) as DbCharge[];
    if (rows.length === 0) return current;
    for (const row of rows) current.set(row.id, row);
    const paidById = await this.paidByCharge(rows.map((r) => r.id));

    for (const row of rows) {
      const next = charges.find((c) => c.id === row.id)!;
      // The payload's `issued_at` is this collect's own `nowIso()` — one clock
      // read for the whole write, so every revived bill in it agrees.
      const revive = isDeadBill(row) ? revivePatch(next.issued_at) : {};
      const reprice =
        next.kind === 'month' && (paidById.get(row.id) ?? 0) <= 0 && !samePrice(row, next)
          ? {
            amount: next.amount,
            currency_id: next.currency_id,
            rate_per_usd_snapshot: next.rate_per_usd_snapshot,
            duration_months: next.duration_months,
            plan_id: next.plan_id,
          }
          : {};

      const patch = { ...revive, ...reprice };
      if (Object.keys(patch).length === 0) continue;

      const { data: updated, error: updateError } = await this.db
        .from('charges')
        .update(patch)
        .eq('id', row.id)
        .select('*, customers(*)')
        .single();
      if (updateError) this.handleError(updateError);
      const after = updated as DbCharge;
      current.set(after.id, after);
      this.audit({
        table: 'charges',
        recordId: row.id,
        action: 'update',
        before: row,
        after,
        branchId: after.branch_id,
        customerId: after.customer_id ?? undefined,
      });
    }
    return current;
  }

  /** Live money on each bill, summed from the items — NOT read from
   *  `charge_balances`, which hides a dead bill and would report 0 (#115). */
  private async paidByCharge(chargeIds: string[]): Promise<Map<string, number>> {
    const items = await this.findItemsForCharges(chargeIds);
    const paid = new Map<string, number>();
    for (const it of items) {
      paid.set(it.charge_id, (paid.get(it.charge_id) ?? 0) + Number(it.amount));
    }
    return paid;
  }

  async create(payload: CreateCollectionPayload): Promise<DbCollection> {
    const { items, charges, ...header } = payload;

    // Every bill the split points at, so the created row is assembled here
    // rather than read back (#119).
    let targets = new Map<string, DbCharge>();
    // The bills must exist before anything can point at them. Upserted by their
    // deterministic id, so a month another device already billed is reused
    // rather than duplicated — and keeps ITS frozen price.
    if (charges.length > 0) {
      // The row the upsert is about to skip may be DEAD (voided / written off)
      // or stale-priced. Fix it FIRST — cash must never land on a bill every
      // read filters out (#115), and an empty one is re-priced (#106b).
      targets = await this.reviveTargetBills(charges);
      const { data: inserted, error } = await this.db
        .from('charges')
        .upsert(charges, { onConflict: 'id', ignoreDuplicates: true })
        .select();
      if (error) this.handleError(error);
      // Only the rows this device actually raised — `ignoreDuplicates` returns
      // nothing for a bill another device had already billed, which is exactly
      // the set that should NOT get a second create entry.
      for (const row of (inserted ?? []) as DbCharge[]) {
        targets.set(row.id, row);
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

    // `.select()` costs nothing extra on an INSERT and gives back the real rows
    // (ids and timestamps), which is half of what the read-back used to fetch.
    const { data: itemData, error: itemsError } = await this.db
      .from('collection_items')
      .insert(items.map((it) => ({ ...it, collection_id: created.id })))
      .select();
    if (itemsError) this.handleError(itemsError);
    const itemRows = (itemData ?? []) as DbCollectionItem[];

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

    // Bills this write did not raise itself — a sale's, a custom fee's. One
    // request, and only when there are any.
    const missing = itemRows.map((it) => it.charge_id).filter((cid) => !targets.has(cid));
    if (missing.length > 0) {
      const { data: rest, error: restError } = await this.db
        .from('charges')
        .select('*')
        .in('id', missing);
      if (restError) this.handleError(restError);
      for (const row of (rest ?? []) as DbCharge[]) targets.set(row.id, row);
    }

    // Assembled, not read back: every row here was just written by this method.
    return {
      ...created,
      collection_items: itemRows.map((it) => ({
        ...it,
        charges: targets.get(it.charge_id) ?? null,
      })),
    };
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection> {
    // Bare row, not `findById`: the diff keeps only a row's own columns, so the
    // split and the customer that read joins in were downloaded to be dropped.
    const { data: prior } = await this.db
      .from('collections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
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
