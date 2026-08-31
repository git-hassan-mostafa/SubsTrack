import { OFFLINE_PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { CashRow, CashStream } from '@/src/core/types';
import type { DbCharge, DbCollection, DbCollectionItem, DbCustomer } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty, upsertNaturalKeyDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type {
  CreateCollectionPayload,
  FindCollectionsOptions,
  ICollectionRepository,
} from './ICollectionRepository';
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

    // intended charge id -> the id the row really has, once find-or-create ran.
    const chargeIdMap = new Map<string, string>();

    await this.write(async (db) => {
      for (const charge of charges) {
        // Find-or-create on the natural key: an existing bill keeps its frozen
        // price, so re-collecting a month never re-prices it.
        const existing = charge.customer_plan_id
          ? await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM charges WHERE customer_plan_id = ? AND billing_month = ?',
            [charge.customer_plan_id, charge.billing_month] as never[],
          )
          : await db.getFirstAsync<{ id: string }>('SELECT id FROM charges WHERE id = ?', [
            charge.id,
          ] as never[]);
        if (existing) {
          chargeIdMap.set(charge.id, existing.id);
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
        const storedId = await upsertNaturalKeyDirty(db, 'charges', chargeRow);
        chargeIdMap.set(charge.id, storedId);
        await this.auditIn(db, {
          table: 'charges',
          recordId: storedId,
          action: 'create',
          after: { ...chargeRow, id: storedId },
          ...(chargeRow.customer_id
            ? await this.customerAudit(chargeRow.customer_id)
            : { branchId: chargeRow.branch_id }),
        });
      }

      await insertDirty(db, 'collections', row);
      for (const it of items) {
        await insertDirty(db, 'collection_items', {
          ...it,
          // Cash must point at the bill that really exists — the ids agree today
          // (a month bill is hashed from its natural key), but an item aimed at a
          // missing row is money pointing at nothing.
          charge_id: chargeIdMap.get(it.charge_id) ?? it.charge_id,
          id: newId(),
          collection_id: id,
          created_at: now,
          updated_at: now,
        });
      }

      await this.auditIn(db, {
        table: 'collections',
        recordId: id,
        action: 'create',
        after: { ...row, collection_items: items },
        ...(row.customer_id
          ? await this.customerAudit(row.customer_id)
          : { branchId: row.branch_id }),
      });
    });

    return (await this.findById(id))!;
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCollection> {
    const prior = await this.findById(id);
    await this.write(async (db) => {
      await updateDirty(db, 'collections', id, {
        voided_at: nowIso(),
        voided_by: voidedBy,
        void_reason: reason,
        updated_at: nowIso(),
      });
      await this.auditIn(db, {
        table: 'collections',
        recordId: id,
        action: 'void',
        before: prior,
        after: { ...prior, voided_at: nowIso(), voided_by: voidedBy, void_reason: reason },
        branchId: prior?.branch_id ?? null,
        subject: prior?.customers?.name ?? null,
      });
    });
    return (await this.findById(id))!;
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
    const priors = this.decodeAll<DbCollection>(
      'collections',
      await this.all(`SELECT * FROM collections WHERE id IN (${holes})`, ids),
    );
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
          subject: prior.customers?.name ?? null,
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
