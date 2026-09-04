import type { SQLiteDatabase } from 'expo-sqlite';
import { OFFLINE_PAGE_SIZE, type BranchFilter } from '@/src/core/constants';
import type { CashRow, CashStream, WalletSource } from '@/src/core/types';
import type { DbCharge, DbCollection, DbCollectionItem, DbCustomer } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import { sanitizeSearchTerm } from '@/src/core/utils/searchTerm';
import { custodyValues } from '@/src/modules/wallet/utils/custodyValues';
import type {
  CollectionSortField,
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
    const dir = opts.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const sortCol = SORT_COLUMNS[opts.sortField ?? 'received_at'] ?? 'received_at';
    const parts: { clause: string; params: unknown[] }[] = [];
    if (!opts.includeVoided) parts.push({ clause: 'c.voided_at IS NULL', params: [] });
    if (opts.voidedOnly) parts.push({ clause: 'c.voided_at IS NOT NULL', params: [] });
    if (opts.kind) parts.push(kindWhere(opts.kind));
    if (opts.customerId) parts.push({ clause: 'c.customer_id = ?', params: [opts.customerId] });
    if (opts.heldByUserId)
      parts.push({ clause: 'c.held_by_user_id = ?', params: [opts.heldByUserId] });
    if (opts.receivedByUserId)
      parts.push({ clause: 'c.received_by_user_id = ?', params: [opts.receivedByUserId] });
    if (opts.startIso) parts.push({ clause: 'c.received_at >= ?', params: [opts.startIso] });
    if (opts.endExclusiveIso)
      parts.push({ clause: 'c.received_at < ?', params: [opts.endExclusiveIso] });
    const search = sanitizeSearchTerm(opts.searchTerm);
    if (search) parts.push({ clause: 'cu.name LIKE ?', params: [`%${search}%`] });
    parts.push(this.branchWhere(opts.branchFilter ?? null, this.BRANCH_SCOPES.collections, 'c'));

    const where = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT c.* FROM collections c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ${where.sql}
        ORDER BY c.${sortCol} ${dir}, c.created_at ${dir}
        LIMIT ? OFFSET ?`,
      [...where.params, limit, offset],
    );
    return this.hydrate(this.decodeAll<DbCollection>('collections', rows));
  }

  async monthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>> {
    if (opts.voidedOnly) return {};
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: 'c.voided_at IS NULL', params: [] },
    ];
    if (opts.kind) parts.push(kindWhere(opts.kind));
    if (opts.customerId) parts.push({ clause: 'c.customer_id = ?', params: [opts.customerId] });
    if (opts.heldByUserId)
      parts.push({ clause: 'c.held_by_user_id = ?', params: [opts.heldByUserId] });
    if (opts.receivedByUserId)
      parts.push({ clause: 'c.received_by_user_id = ?', params: [opts.receivedByUserId] });
    if (opts.startIso) parts.push({ clause: 'c.received_at >= ?', params: [opts.startIso] });
    if (opts.endExclusiveIso)
      parts.push({ clause: 'c.received_at < ?', params: [opts.endExclusiveIso] });
    const search = sanitizeSearchTerm(opts.searchTerm);
    if (search) parts.push({ clause: 'cu.name LIKE ?', params: [`%${search}%`] });
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

  private async reviveTargetBill(
    db: SQLiteDatabase,
    before: DbCharge,
    next: CreateChargePayload,
    audit: { branchId: string | null; subject: string | null; customerId?: string },
  ): Promise<DbCharge> {
    const chargeId = before.id;
    const revive = isDeadBill(before) ? revivePatch(next.issued_at) : {};

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

  private async paidOn(db: SQLiteDatabase, chargeId: string): Promise<number> {
    const row = await db.getFirstAsync<{ total: number | null }>(
      'SELECT SUM(ci.amount) AS total FROM collection_items ci ' +
      'JOIN collections c ON c.id = ci.collection_id ' +
      'WHERE ci.charge_id = ? AND c.voided_at IS NULL',
      [chargeId] as never[],
    );
    return Number(row?.total ?? 0);
  }

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
      held_by_user_id: header.received_by_user_id,
      remitted_at: null,
      remitted_by: null,
    };

    const audit = row.customer_id
      ? await this.customerAudit(row.customer_id)
      : { branchId: row.branch_id, subject: null };

    const targets = new Map<string, DbCharge>();
    const itemRows: DbCollectionItem[] = [];

    await this.write(async (db) => {
      for (const charge of charges) {
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

    const raised = new Set([...targets.values()].map((c) => c.id));
    const byId = await this.rowsById<DbCharge>(
      'charges',
      itemRows.map((it) => it.charge_id).filter((cid) => !raised.has(cid)),
    );
    for (const c of targets.values()) byId.set(c.id, c);

    return {
      ...row,
      collection_items: itemRows.map((it) => ({ ...it, charges: byId.get(it.charge_id) ?? null })),
    };
  }

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
        customerId: prior.row.customer_id ?? undefined,
        branchId: prior.row.branch_id,
        subject: prior.subject,
      });
    });
    return after;
  }

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

  async voidMany(
    ids: string[],
    voidedBy: string,
    reason: string | null,
  ): Promise<DbCollection[]> {
    if (ids.length === 0) return [];
    const now = nowIso();
    const holes = ids.map(() => '?').join(',');
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
    const live = priors.filter((p) => !p.voided_at);
    if (live.length === 0) return [];
    await this.write(async (db) => {
      await db.runAsync(
        `UPDATE collections
            SET voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, _dirty = 1
          WHERE id IN (${holes}) AND voided_at IS NULL`,
        [now, voidedBy, reason, now, ...ids] as never[],
      );
      for (const prior of live) {
        await this.auditIn(db, {
          table: 'collections',
          recordId: prior.id,
          action: 'void',
          before: prior,
          after: { ...prior, voided_at: now, voided_by: voidedBy, void_reason: reason },
          customerId: prior.customer_id ?? undefined,
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

const SORT_COLUMNS: Record<CollectionSortField, string> = {
  received_at: 'received_at',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

function kindWhere(kind: WalletSource): { clause: string; params: unknown[] } {
  return {
    clause: `COALESCE(c.kind, (
        SELECT CASE WHEN COUNT(DISTINCT ch.kind) = 1 THEN MIN(ch.kind) ELSE 'mixed' END
          FROM collection_items i
          JOIN charges ch ON ch.id = i.charge_id
         WHERE i.collection_id = c.id
      )) = ?`,
    params: [kind],
  };
}
