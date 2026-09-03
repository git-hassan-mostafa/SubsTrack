import type { CashRow } from '@/src/core/types';
import type { DbCharge, DbChargeBalance, DbCollection, DbCollectionItem } from '@/src/core/types/db';
import type {
  CreateChargePayload,
  DbChargeWithPaid,
  FindChargesOptions,
  UpdateChargePayload,
} from '@/src/modules/ledger/repository/IChargeRepository';
import type {
  CreateCollectionPayload,
  FindCollectionsOptions,
} from '@/src/modules/ledger/repository/ICollectionRepository';
import {
  isDeadBill,
  revivePatch,
  samePrice,
} from '@/src/modules/ledger/repository/chargeRevive';
import { collectionKind } from '@/src/modules/ledger/utils/collectionKind';
import { sumByMonth } from '@/src/modules/ledger/utils/monthTotals';

/**
 * An in-memory ledger that follows the SAME rules the two real repositories
 * document, so a service test exercises the real decision code against a store
 * that behaves like Postgres does:
 *
 *  - `charge_balances` excludes a VOIDED bill, and a voided hand-over pays
 *    nothing. A WRITTEN-OFF bill keeps its collected money (#115).
 *  - "still owed" = not voided, not written off, balance > 0.
 *  - `create` revives a dead target bill and re-prices an empty one before the
 *    cash lands, then upserts by id ignoring duplicates.
 *
 * It is deliberately NOT a second implementation of any money rule: no waterfall,
 * no month status, no validation. Those stay in the code under test.
 */

let charges: DbCharge[] = [];
let collections: DbCollection[] = [];
let items: DbCollectionItem[] = [];
let n = 0;
const nextId = (p: string) => `${p}-${++n}`;

/** What a hand-over paid for, read off its items — the pre-column fallback. */
const derivedKind = (collectionId: string) =>
  collectionKind(
    items
      .filter((i) => i.collection_id === collectionId)
      .map((i) => charges.find((c) => c.id === i.charge_id)?.kind),
  );

export const store = {
  get charges() {
    return charges;
  },
  get collections() {
    return collections;
  },
  get items() {
    return items;
  },
  charge(id: string) {
    return charges.find((c) => c.id === id) ?? null;
  },
  reset() {
    charges = [];
    collections = [];
    items = [];
    n = 0;
  },
  seedCharge(over: Partial<DbCharge> = {}): DbCharge {
    const row: DbCharge = {
      id: over.id ?? nextId('chg'),
      tenant_id: 't1',
      branch_id: null,
      customer_id: 'cust-1',
      kind: 'month',
      customer_plan_id: 'line-1',
      billing_month: '2026-01-01',
      duration_months: 1,
      plan_id: null,
      sale_id: null,
      description: null,
      amount: 20,
      currency_id: null,
      rate_per_usd_snapshot: 1,
      issued_at: '2026-01-05T10:00:00.000Z',
      due_date: '2026-01-01',
      recorded_by_user_id: 'user-1',
      notes: null,
      created_at: '2026-01-05T10:00:00.000Z',
      updated_at: '2026-01-05T10:00:00.000Z',
      voided_at: null,
      voided_by: null,
      void_reason: null,
      written_off_at: null,
      written_off_by: null,
      write_off_reason: null,
      ...over,
    };
    charges.push(row);
    return row;
  },
  /** A live hand-over paying `amount` against `chargeId`. */
  seedCollection(
    chargeId: string,
    amount: number,
    over: Partial<DbCollection> = {},
  ): DbCollection {
    const row: DbCollection = {
      id: over.id ?? nextId('col'),
      tenant_id: 't1',
      branch_id: null,
      customer_id: 'cust-1',
      amount,
      currency_id: null,
      rate_per_usd_snapshot: 1,
      received_at: '2026-02-01T10:00:00.000Z',
      received_by_user_id: 'user-1',
      notes: null,
      // Null on purpose: a seeded row stands for one written before the column
      // existed, so the read path's fallback derivation stays exercised.
      kind: null,
      created_at: '2026-02-01T10:00:00.000Z',
      updated_at: '2026-02-01T10:00:00.000Z',
      voided_at: null,
      voided_by: null,
      void_reason: null,
      held_by_user_id: 'user-1',
      remitted_at: null,
      remitted_by: null,
      ...over,
    };
    collections.push(row);
    items.push({
      id: nextId('ci'),
      tenant_id: 't1',
      collection_id: row.id,
      charge_id: chargeId,
      amount,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    return row;
  },
};

/** Live money on a bill — voided hand-overs pay nothing. */
function paidOn(chargeId: string): number {
  return items
    .filter((i) => i.charge_id === chargeId)
    .filter((i) => {
      const col = collections.find((c) => c.id === i.collection_id);
      return !!col && col.voided_at === null;
    })
    .reduce((s, i) => s + i.amount, 0);
}

function hydrateCharge(row: DbCharge): DbCharge {
  return { ...row };
}

export const fakeChargeRepository = {
  async findById(id: string) {
    const row = charges.find((c) => c.id === id);
    return row ? hydrateCharge(row) : null;
  },
  async findByIds(ids: string[]) {
    return charges.filter((c) => ids.includes(c.id)).map(hydrateCharge);
  },
  async findMonthChargesForLines(lineIds: string[]): Promise<DbChargeWithPaid[]> {
    return charges
      .filter(
        (c) => c.kind === 'month' && c.voided_at === null && lineIds.includes(c.customer_plan_id!),
      )
      .sort((a, b) => (a.billing_month ?? '').localeCompare(b.billing_month ?? ''))
      .map((charge) => ({ charge: hydrateCharge(charge), paid: paidOn(charge.id) }));
  },
  async findMonthChargesForCustomer(customerId: string): Promise<DbChargeWithPaid[]> {
    return charges
      .filter((c) => c.kind === 'month' && c.voided_at === null && c.customer_id === customerId)
      .sort((a, b) => (a.billing_month ?? '').localeCompare(b.billing_month ?? ''))
      .map((charge) => ({ charge: hydrateCharge(charge), paid: paidOn(charge.id) }));
  },
  async findBySaleId(saleId: string) {
    return charges.find((c) => c.sale_id === saleId) ?? null;
  },
  async findBySaleIds(saleIds: string[]) {
    return charges.filter((c) => c.sale_id && saleIds.includes(c.sale_id)).map(hydrateCharge);
  },
  async findOpenWithPaid(opts: FindChargesOptions): Promise<DbChargeWithPaid[]> {
    return charges
      .filter((c) => c.voided_at === null && c.written_off_at === null)
      .filter((c) => (opts.customerId ? c.customer_id === opts.customerId : true))
      .filter((c) => (opts.customerIds?.length ? opts.customerIds.includes(c.customer_id!) : true))
      .filter((c) => (opts.kinds?.length ? opts.kinds.includes(c.kind) : true))
      .map((charge) => ({ charge: hydrateCharge(charge), paid: paidOn(charge.id) }))
      .filter((r) => r.charge.amount - r.paid > 0)
      .sort((a, b) => a.charge.due_date.localeCompare(b.charge.due_date));
  },
  async balances(ids: string[]): Promise<DbChargeBalance[]> {
    // The view: voided bills are gone, written-off ones are not (#115).
    return charges
      .filter((c) => ids.includes(c.id) && c.voided_at === null)
      .map((c) => {
        const paid = paidOn(c.id);
        return { id: c.id, tenant_id: c.tenant_id, amount: c.amount, paid, balance: c.amount - paid };
      });
  },
  async create(payload: CreateChargePayload): Promise<DbCharge> {
    return store.seedCharge({ ...payload });
  },
  async ensure(payload: CreateChargePayload): Promise<DbCharge> {
    const existing = charges.find(
      (c) =>
        c.customer_plan_id === payload.customer_plan_id &&
        c.billing_month === payload.billing_month,
    );
    return existing ?? store.seedCharge({ ...payload });
  },
  async update(id: string, values: UpdateChargePayload): Promise<DbCharge> {
    const row = charges.find((c) => c.id === id)!;
    Object.assign(row, values, { updated_at: new Date().toISOString() });
    return hydrateCharge(row);
  },
  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCharge> {
    const row = charges.find((c) => c.id === id)!;
    Object.assign(row, {
      voided_at: new Date().toISOString(),
      voided_by: voidedBy,
      void_reason: reason,
    });
    return hydrateCharge(row);
  },
  async writeOff(id: string, by: string, reason: string | null): Promise<DbCharge> {
    const row = charges.find((c) => c.id === id)!;
    Object.assign(row, {
      written_off_at: new Date().toISOString(),
      written_off_by: by,
      write_off_reason: reason,
    });
    return hydrateCharge(row);
  },
  async writtenOffInRange(startIso: string, endExclusiveIso: string): Promise<DbCharge[]> {
    return charges
      .filter((c) => c.written_off_at !== null)
      .filter((c) => c.written_off_at! >= startIso && c.written_off_at! < endExclusiveIso)
      .map(hydrateCharge);
  },
};

export const fakeCollectionRepository = {
  async findById(id: string): Promise<DbCollection | null> {
    const row = collections.find((c) => c.id === id);
    if (!row) return null;
    return {
      ...row,
      collection_items: items
        .filter((i) => i.collection_id === id)
        .map((i) => ({ ...i, charges: charges.find((c) => c.id === i.charge_id) ?? null })),
    };
  },
  async findByIds(ids: string[]): Promise<DbCollection[]> {
    const out: DbCollection[] = [];
    for (const id of ids) {
      const row = await fakeCollectionRepository.findById(id);
      if (row) out.push(row);
    }
    return out;
  },
  async find(opts: FindCollectionsOptions): Promise<DbCollection[]> {
    let rows = collections.slice();
    if (!opts.includeVoided) rows = rows.filter((c) => c.voided_at === null);
    if (opts.voidedOnly) rows = rows.filter((c) => c.voided_at !== null);
    if (opts.customerId) rows = rows.filter((c) => c.customer_id === opts.customerId);
    if (opts.heldByUserId) rows = rows.filter((c) => c.held_by_user_id === opts.heldByUserId);
    if (opts.startIso) rows = rows.filter((c) => c.received_at >= opts.startIso!);
    if (opts.endExclusiveIso) rows = rows.filter((c) => c.received_at < opts.endExclusiveIso!);
    // Both repositories fall back to deriving the kind from the row's own items
    // when the frozen column is still null — the mirror's COALESCE, in JS.
    if (opts.kind) rows = rows.filter((c) => (c.kind ?? derivedKind(c.id)) === opts.kind);
    const asc = opts.sortDirection === 'asc';
    const field = opts.sortField ?? 'received_at';
    // created_at breaks ties, exactly as both repositories order.
    const key = (c: DbCollection) => `${c[field]}|${c.created_at}`;
    rows.sort((a, b) => (asc ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))));
    return fakeCollectionRepository.findByIds(rows.map((r) => r.id));
  },
  async findItemsForCharges(chargeIds: string[]): Promise<DbCollectionItem[]> {
    // A voided hand-over paid nothing, so its lines are not payments.
    return items
      .filter((i) => chargeIds.includes(i.charge_id))
      .filter((i) => collections.find((c) => c.id === i.collection_id)?.voided_at === null);
  },
  async monthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>> {
    // Both repositories: voided money is not money, so it has no total.
    if (opts.voidedOnly) return {};
    let rows = collections.filter((c) => c.voided_at === null);
    if (opts.customerId) rows = rows.filter((c) => c.customer_id === opts.customerId);
    // Same type filter as `find`, or a header total would not match its rows.
    if (opts.kind) rows = rows.filter((c) => (c.kind ?? derivedKind(c.id)) === opts.kind);
    return sumByMonth(
      rows.map((r) => ({
        received_at: r.received_at,
        amount: r.amount,
        rate_per_usd_snapshot: r.rate_per_usd_snapshot,
      })),
    );
  },
  async create(payload: CreateCollectionPayload): Promise<DbCollection> {
    const { items: newItems, charges: newCharges, ...header } = payload;
    const now = new Date().toISOString();
    const targets = new Map<string, DbCharge>();

    for (const next of newCharges) {
      const existing =
        charges.find(
          (c) =>
            next.customer_plan_id !== null &&
            c.customer_plan_id === next.customer_plan_id &&
            c.billing_month === next.billing_month,
        ) ?? charges.find((c) => c.id === next.id);
      if (existing) {
        // 1. revive (unconditional when dead) 2. re-price (only when empty)
        const revive = isDeadBill(existing) ? revivePatch(next.issued_at) : {};
        const reprice =
          next.kind === 'month' && paidOn(existing.id) <= 0 && !samePrice(existing, next)
            ? {
                amount: next.amount,
                currency_id: next.currency_id,
                rate_per_usd_snapshot: next.rate_per_usd_snapshot,
                duration_months: next.duration_months,
                plan_id: next.plan_id,
              }
            : {};
        Object.assign(existing, revive, reprice);
        targets.set(next.id, existing);
        continue;
      }
      targets.set(next.id, store.seedCharge({ ...next }));
    }

    const row: DbCollection = {
      ...header,
      id: nextId('col'),
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      held_by_user_id: header.received_by_user_id,
      remitted_at: null,
      remitted_by: null,
    };
    collections.push(row);
    const itemRows: DbCollectionItem[] = newItems.map((it) => ({
      ...it,
      id: nextId('ci'),
      collection_id: row.id,
      charge_id: targets.get(it.charge_id)?.id ?? it.charge_id,
      created_at: now,
      updated_at: now,
    }));
    items.push(...itemRows);
    return {
      ...row,
      collection_items: itemRows.map((it) => ({
        ...it,
        charges: charges.find((c) => c.id === it.charge_id) ?? null,
      })),
    };
  },
  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection> {
    const row = collections.find((c) => c.id === id)!;
    Object.assign(row, {
      voided_at: new Date().toISOString(),
      voided_by: voidedBy,
      void_reason: reason,
      // Every synced table carries a BEFORE UPDATE trigger for this.
      updated_at: new Date().toISOString(),
    });
    return { ...row };
  },
  async voidMany(ids: string[], voidedBy: string, reason: string | null): Promise<DbCollection[]> {
    const live = collections.filter((c) => ids.includes(c.id) && c.voided_at === null);
    for (const row of live) {
      Object.assign(row, {
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
        updated_at: new Date().toISOString(),
        void_reason: reason,
      });
    }
    return live.map((r) => ({ ...r }));
  },
  async collectedInRange(startIso: string, endExclusiveIso: string): Promise<CashRow[]> {
    return items
      .map((i) => ({ i, col: collections.find((c) => c.id === i.collection_id)! }))
      .filter(({ col }) => col.voided_at === null)
      .filter(({ col }) => col.received_at >= startIso && col.received_at < endExclusiveIso)
      .map(({ i, col }) => {
        const ch = charges.find((c) => c.id === i.charge_id)!;
        return {
          id: i.id,
          collectionId: col.id,
          date: col.received_at,
          amount: i.amount,
          currencyId: col.currency_id,
          ratePerUsdSnapshot: col.rate_per_usd_snapshot,
          branchId: col.branch_id,
          receivedByUserId: col.received_by_user_id,
          customerId: col.customer_id,
          customerName: null,
          planId: ch.plan_id,
          label: ch.description ?? ch.billing_month ?? col.notes,
          stream: ch.kind,
        };
      });
  },
  async findHeld(userId: string): Promise<DbCollection[]> {
    return fakeCollectionRepository.findByIds(
      collections.filter((c) => c.held_by_user_id === userId && !c.voided_at).map((c) => c.id),
    );
  },
  async findAllHeld(): Promise<DbCollection[]> {
    return fakeCollectionRepository.findByIds(
      collections.filter((c) => c.held_by_user_id !== null && !c.voided_at).map((c) => c.id),
    );
  },
  async transferCustody(ids: string[], fromUserId: string, toUserId: string | null) {
    for (const id of ids) {
      const row = collections.find((c) => c.id === id && c.held_by_user_id === fromUserId);
      if (!row) continue;
      row.held_by_user_id = toUserId;
      if (toUserId === null) {
        row.remitted_at = new Date().toISOString();
      }
    }
  },
};
