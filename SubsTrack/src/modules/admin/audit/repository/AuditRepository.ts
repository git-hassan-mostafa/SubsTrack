import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import { PAGE_SIZE } from '@/src/core/constants';
import type { AuditFilter, AuditRecordTarget } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';
import type { AuditPage, AuditRows, IAuditRepository } from './IAuditRepository';
import { OfflineAuditRepository } from './AuditRepository.offline';

/**
 * Supabase-backed audit reads. Tenant scoping and the admin-only restriction are
 * enforced by the audit_logs_select RLS policy — a non-admin caller simply gets
 * an empty result. The BRANCH picker is applied here: RLS already limits a
 * branch-scoped user, but a tenant-wide admin sees every branch, so their
 * selection has to narrow the query.
 */
export class AuditRepository extends BaseRepository implements IAuditRepository {
  // 'shared': a selected branch keeps its own rows AND the tenant-wide ones
  // (branch_id IS NULL) — plans, settings and staff changes belong to no branch.
  private static readonly BRANCH_SCOPE = { kind: 'shared' } as const;

  private applyFilter<T extends Record<string, any>>(query: T, filter: AuditFilter): T {
    let q = query;
    if (filter.table) q = q.eq('table_name', filter.table);
    if (filter.action) q = q.eq('action', filter.action);
    if (filter.actorUserId) q = q.eq('actor_user_id', filter.actorUserId);
    if (filter.from) q = q.gte('occurred_at', filter.from);
    if (filter.to) q = q.lte('occurred_at', filter.to);
    q = this.applyBranchFilter(q, filter.branchFilter ?? null, AuditRepository.BRANCH_SCOPE);
    return q;
  }

  async findRecent(filter: AuditFilter, page = 0): Promise<AuditPage> {
    const from = page * PAGE_SIZE;
    let query = this.db
      .from('audit_logs')
      .select('*')
      // occurred_at, never updated_at: the trail is ordered by when the staff
      // member acted, not by when the row reached the server.
      .order('occurred_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    query = this.applyFilter(query, filter);
    const { data, error } = await query;
    if (error) this.handleError(error);
    const rows = (data ?? []) as DbAuditLog[];
    return { rows, source: 'server', hasMore: rows.length === PAGE_SIZE };
  }

  async findForRecord(table: string, recordId: string): Promise<AuditRows> {
    const { data, error } = await this.db
      .from('audit_logs')
      .select('*')
      .eq('table_name', table)
      .eq('record_id', recordId)
      .order('occurred_at', { ascending: false });
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbAuditLog[], source: 'server' };
  }

  async findForRecords(targets: AuditRecordTarget[]): Promise<AuditRows> {
    if (targets.length === 0) return { rows: [], source: 'server' };
    // One OR of (table AND id) pairs. Two separate `.in()` calls would cross-match —
    // a plan line's id would be accepted under table_name 'customers'.
    const clause = targets
      .map((tr) => `and(table_name.eq.${tr.table},record_id.eq.${tr.recordId})`)
      .join(',');
    const { data, error } = await this.db
      .from('audit_logs')
      .select('*')
      .or(clause)
      .order('occurred_at', { ascending: false });
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbAuditLog[], source: 'server' };
  }

  async findForCustomer(customerId: string, tables: string[]): Promise<AuditRows> {
    const { data, error } = await this.db
      .from('audit_logs')
      .select('*')
      .eq('subject_id', customerId)
      .in('table_name', tables)
      .order('occurred_at', { ascending: false });
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbAuditLog[], source: 'server' };
  }
}

// Platform seam: web → Supabase directly; native → Supabase too, with this
// device's un-pushed rows merged in and the local 30-day window as the fallback.
const impl: IAuditRepository =
  Platform.OS === 'web' ? new AuditRepository() : new OfflineAuditRepository();

export default impl;
