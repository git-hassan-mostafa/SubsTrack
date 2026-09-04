import type { AuditFilter, AuditRecordTarget } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';
import { OFFLINE_PAGE_SIZE } from '@/src/core/constants';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { isOnline } from '@/src/core/offline/net/connectivity';
import type { AuditPage, AuditRows, IAuditRepository } from './IAuditRepository';
import { AuditRepository } from './AuditRepository';

/**
 * Native audit reads: the SERVER is the source, with this device's un-pushed rows
 * merged on top, and the local SQLite window as the fallback.
 *
 * The mirror only ever holds a rolling 30-day window (TableSpec.pullDays) and only
 * what RLS let this device pull, so it is not a substitute for the server — it is
 * what keeps the trail readable with no connection. The un-pushed rows are the
 * mirror image: they exist NOWHERE else until the next push, so a server-only read
 * would hide the newest actions taken on this very device.
 *
 * There is no caller-chosen scope. Reading the whole history is the default, and
 * an unreachable server downgrades the answer instead of failing it — the trail is
 * evidence, so showing less is acceptable, showing nothing is not.
 */
export class OfflineAuditRepository extends OfflineBaseRepository implements IAuditRepository {
  private online = new AuditRepository();

  private static readonly BRANCH_SCOPE = { kind: 'shared' } as const;

  private static merge(server: DbAuditLog[], pending: DbAuditLog[]): DbAuditLog[] {
    if (pending.length === 0) return server;
    const seen = new Set(server.map((r) => r.id));
    return [...server, ...pending.filter((r) => !seen.has(r.id))].sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
  }

  private where(
    filter: AuditFilter,
    extra: { clause: string; params: unknown[] }[] = [],
  ): { sql: string; params: unknown[] } {
    const parts: { clause: string; params: unknown[] }[] = [...extra];
    if (filter.table) parts.push({ clause: 'table_name = ?', params: [filter.table] });
    if (filter.action) parts.push({ clause: 'action = ?', params: [filter.action] });
    if (filter.actorUserId) parts.push({ clause: 'actor_user_id = ?', params: [filter.actorUserId] });
    if (filter.from) parts.push({ clause: 'occurred_at >= ?', params: [filter.from] });
    if (filter.to) parts.push({ clause: 'occurred_at <= ?', params: [filter.to] });
    parts.push(
      this.branchWhere(
        filter.branchFilter ?? null,
        OfflineAuditRepository.BRANCH_SCOPE,
        'audit_logs',
      ),
    );
    return this.combineWhere(parts);
  }

  private async localRows(where: string, params: unknown[], limit = ''): Promise<DbAuditLog[]> {
    const rows = await this.all(
      `SELECT * FROM audit_logs ${where} ORDER BY occurred_at DESC ${limit}`,
      params,
    );
    return this.decodeAll<DbAuditLog>('audit_logs', rows);
  }

  private pending(filter: AuditFilter): Promise<DbAuditLog[]> {
    const { sql, params } = this.where(filter, [{ clause: '_dirty = 1', params: [] }]);
    return this.localRows(sql, params);
  }

  async findRecent(filter: AuditFilter, page = 0): Promise<AuditPage> {
    if (await isOnline()) {
      try {
        const server = await this.online.findRecent(filter, page);
        const pending = page === 0 ? await this.pending(filter) : [];
        return { ...server, rows: OfflineAuditRepository.merge(server.rows, pending) };
      } catch {
      }
    }
    const { sql, params } = this.where(filter);
    const rows = await this.localRows(
      sql,
      params,
      `LIMIT ${OFFLINE_PAGE_SIZE} OFFSET ${page * OFFLINE_PAGE_SIZE}`,
    );
    return { rows, source: 'local', hasMore: rows.length === OFFLINE_PAGE_SIZE };
  }

  private async timeline(
    fetchServer: () => Promise<AuditRows>,
    clause: string,
    params: unknown[],
  ): Promise<AuditRows> {
    if (await isOnline()) {
      try {
        const server = await fetchServer();
        const pending = await this.localRows(`WHERE (${clause}) AND _dirty = 1`, params);
        return { ...server, rows: OfflineAuditRepository.merge(server.rows, pending) };
      } catch {
      }
    }
    return { rows: await this.localRows(`WHERE (${clause})`, params), source: 'local' };
  }

  findForRecord(table: string, recordId: string): Promise<AuditRows> {
    return this.timeline(
      () => this.online.findForRecord(table, recordId),
      'table_name = ? AND record_id = ?',
      [table, recordId],
    );
  }

  findForRecords(targets: AuditRecordTarget[]): Promise<AuditRows> {
    if (targets.length === 0) return Promise.resolve({ rows: [], source: 'server' });
    return this.timeline(
      () => this.online.findForRecords(targets),
      targets.map(() => '(table_name = ? AND record_id = ?)').join(' OR '),
      targets.flatMap((tr) => [tr.table, tr.recordId]),
    );
  }

  findForCustomer(customerId: string, tables: string[]): Promise<AuditRows> {
    if (tables.length === 0) return Promise.resolve({ rows: [], source: 'server' });
    const placeholders = tables.map(() => '?').join(', ');
    return this.timeline(
      () => this.online.findForCustomer(customerId, tables),
      `subject_id = ? AND table_name IN (${placeholders})`,
      [customerId, ...tables],
    );
  }
}
