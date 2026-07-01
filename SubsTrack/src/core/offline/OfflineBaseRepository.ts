import type { SQLiteDatabase } from 'expo-sqlite';
import i18n from '@/src/core/i18n';
import { BRANCH_FILTER_UNASSIGNED, type BranchFilter } from '@/src/core/constants';
import { getDb } from './db/sqlite';
import { decodeRow, decodeRows } from './db/codec';
import { enqueue, type EnqueueOp } from './outbox/outbox';

/** Mirror of BaseRepository.BranchScope — same three semantics, SQL-side. */
export type OfflineBranchScope =
  | { kind: 'owned'; column?: string }
  | { kind: 'shared'; column?: string }
  | { kind: 'inherited'; joinedTable: string; column?: string };

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
      console.error('[Offline Repository Error]', (error as { message: string }).message);
      throw new Error((error as { message: string }).message);
    }
    console.error('[Offline Repository Error]', error);
    throw new Error(i18n.t('errors.unexpected'));
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

  // ── write (data + outbox, atomic) ────────────────────────────────────────
  /**
   * Run a local mutation and its outbox entry in ONE transaction. The callback
   * does the SQLite write(s) and the `enqueue(...)`. Returns the callback's value.
   */
  protected async write<T>(fn: (db: SQLiteDatabase, queue: (op: EnqueueOp) => Promise<void>) => Promise<T>): Promise<T> {
    let result!: T;
    await this.db.withTransactionAsync(async () => {
      result = await fn(this.db, (op) => enqueue(this.db, op));
    });
    return result;
  }
}
