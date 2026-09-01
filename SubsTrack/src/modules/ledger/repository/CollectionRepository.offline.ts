import type { SQLiteDatabase } from 'expo-sqlite';
import { OFFLINE_PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { CashRow, CashStream } from '@/src/core/types';
import type { DbCharge, DbCollection, DbCollectionItem, DbCustomer } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type {
  CreateCollectionPayload,
  FindCollectionsOptions,
  ICollectionRepository,
} from './ICollectionRepository';
import type { CreateChargePayload } from './IChargeRepository';
import { isDeadBill, revivePatch, samePrice } from './chargeRevive';
import { sumByMonth } from '../utils/monthTotals';

/** SQLite-backed hand-overs. Reproduces
 *  `'*, collection_items(*, charges(*)), customers(*)'`. */
export class OfflineCollectionRepository
  extends OfflineBaseRepository
  implements ICollectionRepository {
  private async hydrate(rows: DbCollection[]): Promise<DbCollection[]> {
    if (rows.length === 0) return rows;
    const itemsByParent = await this.childrenByParent<DbCollectionItem>(
      'collection_items',
      'collection_id',
      rows.map((r) => r.id),
      'created_at',
    );
    const chargeIds: string[] = [];
    for (const arr of itemsByParent.values()) for (const it of arr) chargeIds.push(it.charge_id);
    const charges = await this.rowsById<DbCharge>('charges', chargeIds);
    const customers = await this.rowsById<DbCustomer>(
      'customers',
      rows.map((r) => r.customer_id).filter((c): c is string => !!c),
    );
    return rows.map((r) => ({
      ...r,
      collection_items: (itemsByParent.get(r.id) ?? []).map((it) => ({
        ...it,
        charges: charges.get(it.charge_id) ?? null,
      })),
      customers: r.customer_id ? customers.get(r.customer_id) ?? null : null,
    }));
  }

  async findById(id: string): Promise<DbCollection | null> {
    const row = await this.first<Record<string, unknown>>(
      'SELECT * FROM collections WHERE id = ?',
      [id],
    );
    const decoded = this.decodeOne<DbCollection>('collections', row);
    if (!decoded) return null;
    return (await this.hydrate([decoded]))[0];
  }

  async findByIds(ids: string[]): Promise<DbCollection[]> {
    if (ids.length === 0) return [];
    const rows = await this.all(
      `SELECT * FROM collections WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    return this.hydrate(this.decodeAll<DbCollection>('collections', rows));
  }

  async find(opts: FindCollectionsOptions): Promise<DbCollection[]> {
    const limit = opts.limit ?? OFFLINE_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const parts: { clause: string; params: unknown[] }[] = [];
    if (!opts.includeVoided) parts.push({ clause: 'c.voided_at IS NULL', params: [] });
    if (opts.customerId) parts.push({ clause: 'c.customer_id = ?', params: [opts.customerId] });
    if (opts.heldByUserId)
      parts.push({ clause: 'c.held_by_user_id = ?', params: [opts.heldByUserId] });
    if (opts.receivedByUserId)
      parts.push({ clause: 'c.received_by_user_id = ?', params: [opts.receivedByUserId] });
    if (opts.startIso) parts.push({ clause: 'c.received_at >= ?', params: [opts.startIso] });
    if (opts.endExclusiveIso)
      parts.push({ clause: 'c.received_at < ?', params: [opts.endExclusiveIso] });
    if (opts.searchTerm?.trim())
      parts.push({ clause: 'cu.name LIKE ?', params: [`%${opts.searchTerm.trim()}%`] });
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.collections, 'c'));

    const where = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT c.* FROM collections c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ${where.sql}
        ORDER BY c.received_at DESC, c.created_at DESC
        LIMIT ? OFFSET ?`,
      [...where.params, limit, offset],
    );
    return this.hydrate(this.decodeAll<DbCollection>('collections', rows));
  }

  async monthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>> {
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'c.voided_at IS NULL', params: [] },
    ];
    if (opts.customerId) parts.push({ clause: 'c.customer_id = ?', params: [opts.customerId] });
    if (opts.heldByUserId)
      parts.push({ clause: 'c.held_by_user_id = ?', params: [opts.heldByUserId] });
    if (opts.receivedByUserId)
      parts.push({ clause: 'c.received_by_user_id = ?', params: [opts.receivedByUserId] });
    if (opts.startIso) parts.push({ clause: 'c.received_at >= ?', params: [opts.startIso] });
    if (opts.endExclusiveIso)
      parts.push({ clause: 'c.received_at < ?', params: [opts.endExclusiveIso] });
    if (opts.searchTerm?.trim())
      parts.push({ clause: 'cu.name LIKE ?', params: [`%${opts.searchTerm.trim()}%`] });
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.collections, 'c'));

    const where = this.combineWhere(parts);
    const rows = await this.all<{
      received_at: string;
      amount: number;
      rate_per_usd_snapshot: number;
    }>(
      `SELECT c.received_at, c.amount, c.rate_per_usd_snapshot
         FROM collections c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ${where.sql}`,
      where.params,
    );
    return sumByMonth(rows);
  }

  async findItemsForCharges(chargeIds: string[]): Promise<DbCollectionItem[]> {
    if (chargeIds.length === 0) return [];
    const rows = await this.all(
      `SELECT i.* FROM collection_items i
         JOIN collections co ON co.id = i.collection_id
        WHERE co.voided_at IS NULL
          AND i.charge_id IN (${chargeIds.map(() => '?').join(',')})`,
      chargeIds,
    );
    return this.decodeAll<DbCollectionItem>('collection_items', rows);
  }

  /**
   * Make an existing bill a valid target for the money about to land on it —
   * the offline twin of `CollectionRepository.reviveTargetBills`. Two INDEPENDENT
   * steps; see that method for the reasoning.
   *
   * Runs inside the caller's transaction, so the fix and the money that caused
   * it can never be saved apart.
   */
  private async reviveTargetBill(
    db: SQLiteDatabase,
    before: DbCharge,
    next: CreateChargePayload,
    audit: { branchId: string | null; subject: string | null; customerId?: string },
  ): Promise<DbCharge> {
    const chargeId = before.id;
    // 1. Cash is arriving, so the bill EXISTS again — cleared unconditionally,
    //    and re-stamped as raised now (it is being billed again).
    const revive = isDeadBill(before) ? revivePatch(next.issued_at) : {};

    // 2. An EMPTY month bill follows the price the sheet just showed (#106b);
    //    a bill money has reached keeps its frozen price.
    const reprice =
      next.kind === 'month' && (await this.paidOn(db, chargeId)) <= 0 && !samePrice(before, next)
        ? {
          amount: next.amount,
          currency_id: next.currency_id,
          rate_per_usd_snapshot: next.rate_per_usd_snapshot,
          duration_months: next.duration_months,
          plan_id: next.plan_id,
        }
        : {};

    const patch = { ...revive, ...reprice };
    if (Object.keys(patch).length === 0) return before;
    const after = { ...before, ...patch } as DbCharge;
    await updateDirty(db, 'charges', chargeId, patch);
    await this.auditIn(db, {
      table: 'charges',
      recordId: chargeId,
      action: 'update',
      before,
      after,
      ...audit,
    });
    return after;
  }

  /** Live money on one bill, summed from the items — never from a balance read,
   *  which hides a voided or written-off bill and would report 0 (#115). */
  private async paidOn(db: SQLiteDatabase, chargeId: string): Promise<number> {
    const row = await db.getFirstAsync<{ total: number | null }>(
      'SELECT SUM(ci.amount) AS total FROM collection_items ci ' +
      'JOIN collections c ON c.id = ci.collection_id ' +
      'WHERE ci.charge_id = ? AND c.voided_at IS NULL',
      [chargeId] as never[],
    );
    return Number(row?.total ?? 0);
  }

  /**
   * The bills, the hand-over and its split all land in ONE transaction: cash
   * can never be recorded against a bill that failed to save, and a month the
   * waterfall just materialized cannot exist without the money that created it.
   */
  async create(payload: CreateCollectionPayload): Promise<DbCollection> {
    const { items, charges, ...header } = payload;
    const now = nowIso();
    const id = newId();
    const row: DbCollection = {
      ...header,
      id,
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      // The cash starts in the receiving user's wallet.
      held_by_user_id: header.received_by_user_id,
      remitted_at: null,
      remitted_by: null,
    };

    // Resolved ONCE, and outside the transaction: every bill in a hand-over
    // belongs to the same customer it does, so this was the same row read once
    // per charge and again for the collection itself.
    const audit = row.customer_id
      ? await this.customerAudit(row.customer_id)
      : { branchId: row.branch_id, subject: null };

    // intended charge id -> the row the money really lands on.
    const targets = new Map<string, DbCharge>();
    const itemRows: DbCollectionItem[] = [];

    await this.write(async (db) => {
      for (const charge of charges) {
        // Find-or-create on the natural key: a bill money has REACHED keeps its
        // frozen price, so re-collecting it never re-prices it. The WHOLE row is
        // read - reviving it needs it, and returning it saves a read-back.
        const existing = this.decodeOne<DbCharge>(
          'charges',
          charge.customer_plan_id
            ? await db.getFirstAsync<Record<string, unknown>>(
              'SELECT * FROM charges WHERE customer_plan_id = ? AND billing_month = ?',
              [charge.customer_plan_id, charge.billing_month] as never[],
            )
            : await db.getFirstAsync<Record<string, unknown>>(
              'SELECT * FROM charges WHERE id = ?',
              [charge.id] as never[],
            ),
        );
        if (existing) {
          // The row found may be DEAD (voided / written off) — the natural key
          // is unique whatever its state, so it is the only row this month can
          // ever have. Cash arriving revives it, and an empty one is re-priced.
          targets.set(charge.id, await this.reviveTargetBill(db, existing, charge, audit));
          continue;
        }
        const chargeRow: DbCharge = {
          ...charge,
          created_at: now,
          updated_at: now,
          voided_at: null,
          voided_by: null,
          void_reason: null,
          written_off_at: null,
          written_off_by: null,
          write_off_reason: null,
        };
        // The natural key was just checked, so the only collision left is an id
        // already held by an unrelated row.
        const taken = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM charges WHERE id = ?',
          [chargeRow.id] as never[],
        );
        const stored: DbCharge = { ...chargeRow, id: taken ? newId() : chargeRow.id };
        await insertDirty(db, 'charges', stored);
        targets.set(charge.id, stored);
        await this.auditIn(db, {
          table: 'charges',
          recordId: stored.id,
          action: 'create',
          after: stored,
          ...audit,
        });
      }

      await insertDirty(db, 'collections', row);
      for (const it of items) {
        const itemRow: DbCollectionItem = {
          ...it,
          // Cash must point at the bill that really exists — the ids agree today
          // (a month bill is hashed from its natural key), but an item aimed at a
          // missing row is money pointing at nothing.
          charge_id: targets.get(it.charge_id)?.id ?? it.charge_id,
          id: newId(),
          collection_id: id,
          created_at: now,
          updated_at: now,
        };
        itemRows.push(itemRow);
        await insertDirty(db, 'collection_items', itemRow);
      }

      await this.auditIn(db, {
        table: 'collections',
        recordId: id,
        action: 'create',
        after: { ...row, collection_items: items },
        ...audit,
      });
    });

    // The split must carry every bill it settled or the grid cannot repaint from
    // it, so bills this write did not raise itself are read - in one query.
    const raised = new Set([...targets.values()].map((c) => c.id));
    const byId = await this.rowsById<DbCharge>(
      'charges',
      itemRows.map((it) => it.charge_id).filter((cid) => !raised.has(cid)),
    );
    for (const c of targets.values()) byId.set(c.id, c);

    // Assembled, not read back: every row here was just written by this method.
    return {
      ...row,
      collection_items: itemRows.map((it) => ({ ...it, charges: byId.get(it.charge_id) ?? null })),
    };
  }

  /**
   * Undo ONE hand-over. Like `voidMany`, the row comes back un-hydrated: the
   * caller already holds the split it passed in, and three hydrated reads to
   * stamp three columns is what made undoing a payment feel slow.
   */
  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection> {
    const now = nowIso();
    const prior = await this.forAudit(id);
    if (!prior) this.handleError(new Error('Collection not found'));
    const changes = {
      voided_at: now,
      voided_by: voidedBy,
      void_reason: reason,
      updated_at: now,
    };
    const after = { ...prior.row, ...changes };
    await this.write(async (db) => {
      await updateDirty(db, 'collections', id, changes);
      await this.auditIn(db, {
        table: 'collections',
        recordId: id,
        action: 'void',
        before: prior.row,
        after,
        branchId: prior.row.branch_id,
        subject: prior.subject,
      });
    });
    return after;
  }

  // The row plus the frozen customer name, in ONE read - all the trail needs.
  private async forAudit(
    id: string,
  ): Promise<{ row: DbCollection; subject: string | null } | null> {
    const raw = await this.first<Record<string, unknown>>(
      `SELECT c.*, cu.name AS __subject FROM collections c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.id = ?`,
      [id],
    );
    const row = this.decodeOne<DbCollection>('collections', raw);
    return row ? { row, subject: (raw?.__subject as string | null) ?? null } : null;
  }

  /**
   * Void many hand-overs inside ONE transaction and ONE UPDATE. A loop over
   * `void()` opened a transaction per row — and expo-sqlite gives the app a
   * single connection, so each one queued behind `withDbLock`. That queue is
   * what made voiding a paid bill or sale slow.
   *
   * The rows come back UN-hydrated (no items, charges or customer): every caller
   * only wants to know what was voided, so paying `hydrate`'s three extra
   * queries for joins nobody reads would undo the point of batching.
   */
  async voidMany(
    ids: string[],
    voidedBy: string,
    reason: string | null,
  ): Promise<DbCollection[]> {
    if (ids.length === 0) return [];
    const now = nowIso();
    const holes = ids.map(() => '?').join(',');
    // The priors the audit needs — and, once stamped, the return value, so the
    // write is not followed by a read of what we already know.
    // The customer name is joined in, not left null: the trail freezes it, and
    // a bare `SELECT *` here quietly filed every batched void under no name.
    const raw = await this.all<Record<string, unknown>>(
      `SELECT c.*, cu.name AS __subject FROM collections c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.id IN (${holes})`,
      ids,
    );
    const subjects = new Map(
      raw.map((r) => [r.id as string, (r.__subject as string | null) ?? null]),
    );
    const priors = this.decodeAll<DbCollection>('collections', raw);
    // Already-voided rows are skipped by the UPDATE's guard, so they are not
    // "what this call voided" either.
    const live = priors.filter((p) => !p.voided_at);
    if (live.length === 0) return [];
    await this.write(async (db) => {
      await db.runAsync(
        `UPDATE collections
            SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
          WHERE id IN (${holes}) AND voided_at IS NULL`,
        [now, voidedBy, reason, now, ...ids] as never[],
      );
      // One entry per record — the trail stays per row, only the write batches.
      for (const prior of live) {
        await this.auditIn(db, {
          table: 'collections',
          recordId: prior.id,
          action: 'void',
          before: prior,
          after: { ...prior, voided_at: now, voided_by: voidedBy, void_reason: reason },
          branchId: prior.branch_id ?? null,
          subject: subjects.get(prior.id) ?? null,
        });
      }
    });
    return live.map((p) => ({
      ...p,
      voided_at: now,
      voided_by: voidedBy,
      void_reason: reason,
      updated_at: now,
    }));
  }

  // ── Money in ──────────────────────────────────────────────────────────────

  // Mirror of the Supabase read: ONE ROW PER BILL SETTLED, tagged with what
  // that bill was. See CollectionRepository.collectedInRange.
  async collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    const parts = [
      { clause: 'co.voided_at IS NULL', params: [] as unknown[] },
      { clause: 'co.received_at >= ?', params: [startIso] },
      { clause: 'co.received_at < ?', params: [endExclusiveIso] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.collections, 'co'),
    ];
    const where = this.combineWhere(parts);
    const rows = await this.all<{
      id: string;
      amount: number;
      kind: CashStream;
      plan_id: string | null;
      description: string | null;
      billing_month: string | null;
      collection_id: string;
      received_at: string;
      currency_id: string | null;
      rate_per_usd_snapshot: number;
      branch_id: string | null;
      received_by_user_id: string | null;
      customer_id: string | null;
      customer_name: string | null;
      notes: string | null;
    }>(
      `SELECT i.id, i.amount,
              ch.kind, ch.plan_id, ch.description, ch.billing_month,
              co.id AS collection_id, co.received_at, co.currency_id,
              co.rate_per_usd_snapshot, co.branch_id, co.received_by_user_id,
              co.customer_id, co.notes, cu.name AS customer_name
         FROM collection_items i
         JOIN collections co ON co.id = i.collection_id
         JOIN charges ch ON ch.id = i.charge_id
         LEFT JOIN customers cu ON cu.id = co.customer_id
        ${where.sql}`,
      where.params,
    );
    return rows.map((r) => ({
      id: r.id,
      collectionId: r.collection_id,
      date: r.received_at,
      amount: Number(r.amount),
      currencyId: r.currency_id,
      ratePerUsdSnapshot: Number(r.rate_per_usd_snapshot),
      branchId: r.branch_id,
      receivedByUserId: r.received_by_user_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      planId: r.plan_id,
      label: r.description ?? r.billing_month ?? r.notes,
      stream: r.kind,
    }));
  }

  // ── Collector wallet ──────────────────────────────────────────────────────

  async findHeld(userId: string, branchFilter: BranchFilter): Promise<DbCollection[]> {
    const parts = [
      { clause: 'c.held_by_user_id = ?', params: [userId] as unknown[] },
      { clause: 'c.voided_at IS NULL', params: [] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.collections, 'c'),
    ];
    const where = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT c.* FROM collections c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ${where.sql}`,
      where.params,
    );
    return this.hydrate(this.decodeAll<DbCollection>('collections', rows));
  }

  async findAllHeld(branchFilter: BranchFilter): Promise<DbCollection[]> {
    const parts = [
      { clause: 'c.held_by_user_id IS NOT NULL', params: [] as unknown[] },
      { clause: 'c.voided_at IS NULL', params: [] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.collections, 'c'),
    ];
    const where = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT c.* FROM collections c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ${where.sql}`,
      where.params,
    );
    return this.hydrate(this.decodeAll<DbCollection>('collections', rows));
  }

  async transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        // Guarded on the SOURCE wallet, like the server's UPDATE — two admins
        // racing on the same rows cannot both take them.
        const owned = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM collections WHERE id = ? AND held_by_user_id = ?',
          [id, fromUserId] as never[],
        );
        if (!owned) continue;
        await updateDirty(db, 'collections', id, {
          ...custodyValues(toUserId, actorUserId),
          updated_at: nowIso(),
        });
      }
    });
  }
}
