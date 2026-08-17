import type { SQLiteDatabase } from 'expo-sqlite';
import i18n from '@/src/core/i18n';
import { BRANCH_FILTER_UNASSIGNED, type BranchFilter } from '@/src/core/constants';
import { getDb } from './db/sqlite';
import { decodeRow, decodeRows } from './db/codec';
import { insertDirty, markDeleted, updateDirty } from './db/dml';
import { logException } from '../errorLog/errorLogger';
import { buildAuditRow, type AuditInput } from '../audit';

/** Mirror of BaseRepository.BranchScope — same three semantics, SQL-side. */
export type OfflineBranchScope =
  | { kind: 'owned'; column?: string }
  | { kind: 'shared'; column?: string }
  | { kind: 'inherited'; joinedTable: string; column?: string };

// The whole native app shares ONE SQLite connection (getDb()), and SQLite allows
// only one open transaction on it at a time. Concurrent write() calls — e.g.
// WalletService remitting payments + sales + debt_payments via Promise.all — would
// otherwise each BEGIN on the same handle and throw "cannot start a transaction
// within a transaction". This module-level chain serialises every write so
// overlapping calls queue and run one after another.
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * The offline counterpart to BaseRepository. Holds the SQLite handle, an
 * error path that throws the SAME `Error(message)` shape services already
 * catch, the branch-scope SQL builder, generic read helpers, and the atomic
 * write+outbox transaction. Offline repos extend this so they read like the
 * Supabase ones.
 */
export abstract class OfflineBaseRepository {
  protected get db(): SQLiteDatabase {
    return getDb();
  }

  protected handleError(error: unknown): never {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message: string }).message;
      console.error('[Offline Repository Error]', message);
      void logException({ source: 'repository', message, context: this.constructor.name });
      throw new Error(message);
    }
    console.error('[Offline Repository Error]', error);
    void logException({ source: 'repository', message: String(error), context: this.constructor.name });
    throw new Error(i18n.t('errors.unexpected'));
  }

  /**
   * Append one entry to the audit trail, INSIDE the caller's `write()`
   * transaction — pass the `db` handle `write()` gave you, never `this.db`. That
   * is what guarantees a change and its trail commit or roll back together, and
   * that both work with no network.
   *
   * A no-op edit (nothing actually changed) writes nothing. Unlike the online
   * `audit()`, a failure here DOES propagate: it would roll back the surrounding
   * transaction, which is the correct outcome — a local write we cannot account
   * for is worse than a failed save the user can retry.
   */
  protected async auditIn(db: SQLiteDatabase, input: AuditInput): Promise<void> {
    const row = buildAuditRow(input);
    if (row) await insertDirty(db, 'audit_logs', row);
  }

  /**
   * `UPDATE` one row by id and record the diff, in one transaction. Covers the
   * repeated read-patch-diff dance for tables whose branch is their own
   * `branch_id` column (plans, products, branches, currencies, users, …).
   *
   * `branchColumn: null` marks a table with no branch dimension at all
   * (currencies, tenant_settings) — the entry gets `branch_id = null`, meaning
   * "tenant-wide", so every admin can see it.
   */
  protected async auditedUpdate<T extends { id: string }>(
    table: AuditInput['table'],
    id: string,
    patch: object,
    opts: { action?: AuditInput['action']; branchColumn?: keyof T | null } = {},
  ): Promise<T | null> {
    const { action = 'update', branchColumn = 'branch_id' as keyof T } = opts;
    return this.write(async (db) => {
      const read = async (): Promise<T | null> =>
        this.decodeOne<T>(table, await this.first(`SELECT * FROM ${table} WHERE id = ?`, [id]));
      const before = await read();
      await updateDirty(db, table, id, patch);
      const after = await read();
      if (before && after) {
        await this.auditIn(db, {
          table,
          recordId: id,
          action,
          before,
          after,
          branchId: branchColumn ? ((after[branchColumn] as string | null) ?? null) : null,
        });
      }
      return after;
    });
  }

  /**
   * Hard-delete rows by id, logging each for replay and snapshotting it first —
   * a delete's whole value in the trail is the copy of what was removed.
   * `branchColumn` follows the same rule as `auditedUpdate`.
   */
  protected async auditedDelete<T extends { id: string }>(
    table: AuditInput['table'],
    ids: string[],
    opts: { branchColumn?: keyof T | null } = {},
  ): Promise<void> {
    if (ids.length === 0) return;
    const { branchColumn = 'branch_id' as keyof T } = opts;
    await this.write(async (db) => {
      for (const id of ids) {
        const before = this.decodeOne<T>(
          table,
          await this.first(`SELECT * FROM ${table} WHERE id = ?`, [id]),
        );
        await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id] as never[]);
        await markDeleted(db, table, id);
        if (before) {
          await this.auditIn(db, {
            table,
            recordId: id,
            action: 'delete',
            before,
            branchId: branchColumn ? ((before[branchColumn] as string | null) ?? null) : null,
          });
        }
      }
    });
  }

  // Same per-table branch semantics as BaseRepository.BRANCH_SCOPES.
  protected readonly BRANCH_SCOPES = {
    customers: { kind: 'owned' },
    users: { kind: 'owned' },
    plans: { kind: 'shared' },
    payments: { kind: 'inherited', joinedTable: 'customers' },
    customer_plans: { kind: 'inherited', joinedTable: 'customers' },
    products: { kind: 'shared' },
    sales: { kind: 'owned' },
    custom_debts: { kind: 'inherited', joinedTable: 'customers' },
    debt_payments: { kind: 'inherited', joinedTable: 'customers' },
    expenses: { kind: 'owned' },
    // Money, not stock: a SHARED product's purchase is a company expense, so it
    // must NOT be 'shared' here or every branch would count the same spend.
    stock_movements: { kind: 'inherited', joinedTable: 'products' },
  } satisfies Record<string, OfflineBranchScope>;

  /**
   * Build a WHERE fragment + params reproducing `applyBranchFilter`:
   *   null                     → '' (no filter)
   *   UNASSIGNED               → <alias>.branch_id IS NULL
   *   UUID, owned              → <alias>.branch_id = ?
   *   UUID, shared             → (<alias>.branch_id IS NULL OR <alias>.branch_id = ?)
   *   UUID, inherited          → caller JOINs the parent and passes its alias
   * `alias` is the table/alias the branch column lives on.
   */
  protected branchWhere(
    filter: BranchFilter,
    scope: OfflineBranchScope,
    alias: string,
  ): { clause: string; params: unknown[] } {
    if (filter === null) return { clause: '', params: [] };
    const column = scope.column ?? 'branch_id';
    const col = `${alias}.${column}`;
    if (filter === BRANCH_FILTER_UNASSIGNED) return { clause: `${col} IS NULL`, params: [] };
    if (scope.kind === 'shared') {
      return { clause: `(${col} IS NULL OR ${col} = ?)`, params: [filter] };
    }
    return { clause: `${col} = ?`, params: [filter] };
  }

  /** Combine WHERE fragments (dropping empties) into a single clause + params. */
  protected combineWhere(
    parts: { clause: string; params: unknown[] }[],
  ): { sql: string; params: unknown[] } {
    const nonEmpty = parts.filter((p) => p.clause);
    if (nonEmpty.length === 0) return { sql: '', params: [] };
    return {
      sql: 'WHERE ' + nonEmpty.map((p) => p.clause).join(' AND '),
      params: nonEmpty.flatMap((p) => p.params),
    };
  }

  /** A case-insensitive multi-column LIKE OR fragment (the `ilike` equivalent). */
  protected searchWhere(columns: string[], term?: string): { clause: string; params: unknown[] } {
    const q = (term ?? '').trim().replace(/[,()]/g, ''); // strip PostgREST-reserved chars (parity with online)
    if (!q) return { clause: '', params: [] };
    const like = `%${q}%`;
    return {
      clause: '(' + columns.map((c) => `${c} LIKE ? COLLATE NOCASE`).join(' OR ') + ')',
      params: columns.map(() => like),
    };
  }

  // ── low-level read ──────────────────────────────────────────────────────
  protected all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params as never[]);
  }

  protected first<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, params as never[]);
  }

  /**
   * The audit facts a child row inherits from its owning customer — mirrors
   * `BaseRepository.customerAudit`. See it for why both come from one query.
   */
  protected async customerAudit(
    customerId: string,
  ): Promise<{ branchId: string | null; subject: string | null; customerId: string }> {
    const row = await this.first<{ branch_id: string | null; name: string | null }>(
      'SELECT branch_id, name FROM customers WHERE id = ?',
      [customerId],
    );
    return { branchId: row?.branch_id ?? null, subject: row?.name ?? null, customerId };
  }

  /**
   * Just the frozen customer name, for a table that already owns its branch_id
   * (sales). `null` for a record with no customer — a walk-in sale.
   */
  protected async customerSubject(customerId: string | null): Promise<string | null> {
    if (!customerId) return null;
    return (await this.customerAudit(customerId)).subject;
  }

  protected decodeAll<T>(table: string, rows: Record<string, unknown>[]): T[] {
    return decodeRows<T>(table, rows);
  }

  protected decodeOne<T>(table: string, row: Record<string, unknown> | null): T | null {
    return row ? decodeRow<T>(table, row) : null;
  }

  /** Children of a parent set keyed by FK — the building block for join hydration. */
  protected async childrenByParent<T>(
    table: string,
    fkColumn: string,
    parentIds: string[],
    orderBy?: string,
  ): Promise<Map<string, T[]>> {
    const map = new Map<string, T[]>();
    if (parentIds.length === 0) return map;
    const ph = parentIds.map(() => '?').join(', ');
    const rows = await this.all(
      `SELECT * FROM ${table} WHERE ${fkColumn} IN (${ph})${orderBy ? ` ORDER BY ${orderBy}` : ''}`,
      parentIds,
    );
    for (const raw of rows) {
      const key = (raw as Record<string, unknown>)[fkColumn] as string;
      const decoded = decodeRow<T>(table, raw as Record<string, unknown>);
      const arr = map.get(key);
      if (arr) arr.push(decoded);
      else map.set(key, [decoded]);
    }
    return map;
  }

  /** A single related row per id (e.g. plan for a line) keyed by id. */
  protected async rowsById<T>(table: string, ids: string[]): Promise<Map<string, T>> {
    const map = new Map<string, T>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return map;
    const ph = unique.map(() => '?').join(', ');
    const rows = await this.all(`SELECT * FROM ${table} WHERE id IN (${ph})`, unique);
    for (const raw of rows) {
      const id = (raw as Record<string, unknown>).id as string;
      map.set(id, decodeRow<T>(table, raw as Record<string, unknown>));
    }
    return map;
  }

  /** Parity with BaseRepository.referencedIdsIn — subset of ids present in table.column. */
  protected async referencedIdsIn(
    table: string,
    column: string,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const ph = ids.map(() => '?').join(', ');
    const rows = await this.all<{ v: string | null }>(
      `SELECT DISTINCT ${column} AS v FROM ${table} WHERE ${column} IN (${ph})`,
      ids,
    );
    return new Set(rows.map((r) => r.v).filter((v): v is string => !!v));
  }

  protected async count(sql: string, params: unknown[] = []): Promise<number> {
    const r = await this.first<{ n: number }>(sql, params);
    return r?.n ?? 0;
  }

  // ── write (local mutation, atomic) ───────────────────────────────────────
  /**
   * Run one or more local mutations in a single transaction. The dml helpers
   * (`insertDirty` / `updateDirty` / `upsertNaturalKeyDirty`) mark rows `_dirty = 1`
   * so the next push sends them; hard deletes call `markDeleted(db, table, id)`.
   * No outbox — the `_dirty` flag + `pending_deletes` are the whole write intent.
   */
  protected write<T>(fn: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      let result!: T;
      await this.db.withTransactionAsync(async () => {
        result = await fn(this.db);
      });
      return result;
    };
    // Chain onto the queue regardless of whether the previous write succeeded,
    // then keep the queue alive by swallowing this write's result/rejection —
    // the real result/rejection is still returned to the caller via `next`.
    const next = writeQueue.then(run, run);
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
