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

const COLLECTION_SELECT = '*, collection_items(*, charges(*)), customers(*)';
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
    const search = sanitizeSearchTerm(opts.searchTerm);
    let query = this.db
      .from('collections')
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
      .is('collections.voided_at', null);
    if (error) this.handleError(error);
    return (data ?? []) as DbCollectionItem[];
  }

  private async reviveTargetBills(
    charges: CreateChargePayload[],
  ): Promise<Map<string, DbCharge>> {
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

    let targets = new Map<string, DbCharge>();
    if (charges.length > 0) {
      targets = await this.reviveTargetBills(charges);
      const { data: inserted, error } = await this.db
        .from('charges')
        .upsert(charges, { onConflict: 'id', ignoreDuplicates: true })
        .select();
      if (error) this.handleError(error);
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
      .insert({ ...header, held_by_user_id: header.received_by_user_id })
      .select(COLLECTION_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const created = data as DbCollection;

    const { data: itemData, error: itemsError } = await this.db
      .from('collection_items')
      .insert(items.map((it) => ({ ...it, collection_id: created.id })))
      .select();
    if (itemsError) this.handleError(itemsError);
    const itemRows = (itemData ?? []) as DbCollectionItem[];

    this.audit({
      table: 'collections',
      recordId: created.id,
      action: 'create',
      after: { ...created, collection_items: items },
      branchId: created.branch_id,
      customerId: created.customer_id ?? undefined,
      subject: created.customers?.name ?? null,
    });

    const missing = itemRows.map((it) => it.charge_id).filter((cid) => !targets.has(cid));
    if (missing.length > 0) {
      const { data: rest, error: restError } = await this.db
        .from('charges')
        .select('*')
        .in('id', missing);
      if (restError) this.handleError(restError);
      for (const row of (rest ?? []) as DbCharge[]) targets.set(row.id, row);
    }

    return {
      ...created,
      collection_items: itemRows.map((it) => ({
        ...it,
        charges: targets.get(it.charge_id) ?? null,
      })),
    };
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection> {
    const { data: prior } = await this.db
      .from('collections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const { data, error } = await this.db
      .from('collections')
      .update({ voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason })
      .eq('id', id)
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
      .is('voided_at', null)
      .select(COLLECTION_SELECT_LEAN);
    if (error) this.handleError(error);
    const voided = (data ?? []) as DbCollection[];
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


  async collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
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


  async findHeld(userId: string, branchFilter: BranchFilter): Promise<DbCollection[]> {
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
      .eq('held_by_user_id', fromUserId);
    if (error) this.handleError(error);
  }
}

export default Platform.OS === 'web'
  ? new CollectionRepository()
  : new OfflineCollectionRepository();
