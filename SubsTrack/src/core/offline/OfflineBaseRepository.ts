import type { SQLiteDatabase } from 'expo-sqlite';
import i18n from '@/src/core/i18n';
import { BRANCH_FILTER_UNASSIGNED, type BranchFilter } from '@/src/core/constants';
import { getDb } from './db/sqlite';
import { decodeRow, decodeRows } from './db/codec';
import { insertDirty, markDeleted, updateDirty } from './db/dml';
import { withDbLock } from './dbLock';
import { logException } from '../errorLog/errorLogger';
import { sanitizeSearchTerm } from '../utils/searchTerm';
import { buildAuditRow, type AuditInput } from '../audit';

/** Mirror of BaseRepository.BranchScope — same three semantics, SQL-side. */
export type OfflineBranchScope =
  | { kind: 'owned'; column?: string }
  | { kind: 'shared'; column?: string }
  | { kind: 'inherited'; joinedTable: string; column?: string };

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

  protected async auditIn(db: SQLiteDatabase, input: AuditInput): Promise<void> {
    const row = buildAuditRow(input);
    if (row) await insertDirty(db, 'audit_logs', row);
  }

  protected async auditedUpdate<T extends { id: string }>(
    table: AuditInput['table'],
    id: string,
    patch: object,
    opts: {
      action?: AuditInput['action'];
      branchColumn?: keyof T | null;
      audit?: { branchId?: string | null; subject?: string | null };
    } = {},
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
          branchId:
            opts.audit?.branchId ??
            (branchColumn ? ((after[branchColumn] as string | null) ?? null) : null),
          subject: opts.audit?.subject,
        });
      }
      return after;
    });
  }

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

  protected readonly BRANCH_SCOPES = {
    customers: { kind: 'owned' },
    users: { kind: 'owned' },
    plans: { kind: 'shared' },
    charges: { kind: 'owned' },
    collections: { kind: 'owned' },
    customer_plans: { kind: 'inherited', joinedTable: 'customers' },
    products: { kind: 'shared' },
    services: { kind: 'shared' },
    sales: { kind: 'owned' },
    expenses: { kind: 'owned' },
    stock_movements: { kind: 'inherited', joinedTable: 'products' },
  } satisfies Record<string, OfflineBranchScope>;

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

  protected searchWhere(columns: string[], term?: string): { clause: string; params: unknown[] } {
    const q = sanitizeSearchTerm(term);
    if (!q) return { clause: '', params: [] };
    const like = `%${q}%`;
    return {
      clause: '(' + columns.map((c) => `${c} LIKE ? COLLATE NOCASE`).join(' OR ') + ')',
      params: columns.map(() => like),
    };
  }

  protected all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params as never[]);
  }

  protected first<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, params as never[]);
  }

  protected async customerAudit(
    customerId: string,
  ): Promise<{ branchId: string | null; subject: string | null; customerId: string }> {
    const row = await this.first<{ branch_id: string | null; name: string | null }>(
      'SELECT branch_id, name FROM customers WHERE id = ?',
      [customerId],
    );
    return { branchId: row?.branch_id ?? null, subject: row?.name ?? null, customerId };
  }

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

  protected write<T>(fn: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    return withDbLock(async () => {
      let result!: T;
      await this.db.withTransactionAsync(async () => {
        result = await fn(this.db);
      });
      return result;
    });
  }
}
