import type { AuditFilter, AuditRecordTarget } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';
import { OFFLINE_PAGE_SIZE } from '@/src/core/constants';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { isOnline } from '@/src/core/offline/net/connectivity';
import { RequiresConnectionError } from '@/src/core/offline/errors';
import type { IAuditRepository } from './IAuditRepository';
import { AuditRepository } from './AuditRepository';

/**
 * SQLite-backed audit reads. The mirror holds a rolling 30-day window
 * (TableSpec.pullDays), which is what makes the recent trail readable offline.
 *
 * Anything older lives only on the server, so `findAll` — and a `full` record
 * timeline — are online-only and delegate to the Supabase sibling, the same
 * pattern as SubscriptionRepository.offline.upgradeTenant.
 *
 * Note the mirror only ever contains what RLS let this device pull: an admin
 * sees the whole tenant's window, a staff user sees nothing but their own
 * un-pushed rows. That is intended — the trail is admin-only.
 */
export class OfflineAuditRepository extends OfflineBaseRepository implements IAuditRepository {
  private online = new AuditRepository();

  // Mirrors AuditRepository.BRANCH_SCOPE — a selected branch keeps its own rows
  // plus the tenant-wide ones (branch_id IS NULL).
  private static readonly BRANCH_SCOPE = { kind: 'shared' } as const;

  private where(filter: AuditFilter): { sql: string; params: unknown[] } {
    const parts: { clause: string; params: unknown[] }[] = [];
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

  async findRecent(filter: AuditFilter, page = 0): Promise<DbAuditLog[]> {
    const { sql, params } = this.where(filter);
    const rows = await this.all(
      `SELECT * FROM audit_logs ${sql} ORDER BY occurred_at DESC
       LIMIT ${OFFLINE_PAGE_SIZE} OFFSET ${page * OFFLINE_PAGE_SIZE}`,
      params,
    );
    return this.decodeAll<DbAuditLog>('audit_logs', rows);
  }

  async findAll(filter: AuditFilter, page = 0): Promise<DbAuditLog[]> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.findAll(filter, page);
  }

  async findForRecord(table: string, recordId: string, full = false): Promise<DbAuditLog[]> {
    if (full) {
      if (!(await isOnline())) throw new RequiresConnectionError();
      return this.online.findForRecord(table, recordId, true);
    }
    const rows = await this.all(
      'SELECT * FROM audit_logs WHERE table_name = ? AND record_id = ? ORDER BY occurred_at DESC',
      [table, recordId],
    );
    return this.decodeAll<DbAuditLog>('audit_logs', rows);
  }

  async findForRecords(targets: AuditRecordTarget[], full = false): Promise<DbAuditLog[]> {
    if (targets.length === 0) return [];
    if (full) {
      if (!(await isOnline())) throw new RequiresConnectionError();
      return this.online.findForRecords(targets, true);
    }
    // Pairs, not two INs: a plan line's id must not match under table_name
    // 'customers'. Parameterized, so the ids are never interpolated.
    const clause = targets.map(() => '(table_name = ? AND record_id = ?)').join(' OR ');
    const params = targets.flatMap((tr) => [tr.table, tr.recordId]);
    const rows = await this.all(
      `SELECT * FROM audit_logs WHERE ${clause} ORDER BY occurred_at DESC`,
      params,
    );
    return this.decodeAll<DbAuditLog>('audit_logs', rows);
  }

  async findForCustomer(
    customerId: string,
    tables: string[],
    full = false,
  ): Promise<DbAuditLog[]> {
    if (tables.length === 0) return [];
    if (full) {
      if (!(await isOnline())) throw new RequiresConnectionError();
      return this.online.findForCustomer(customerId, tables, true);
    }
    const placeholders = tables.map(() => '?').join(', ');
    const rows = await this.all(
      `SELECT * FROM audit_logs WHERE subject_id = ? AND table_name IN (${placeholders})
       ORDER BY occurred_at DESC`,
      [customerId, ...tables],
    );
    return this.decodeAll<DbAuditLog>('audit_logs', rows);
  }
}
