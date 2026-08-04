import type { AuditFilter } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';

/**
 * The audit-trail READ contract. Writes are not here: entries are appended by
 * each repository next to the change it made (BaseRepository.audit /
 * OfflineBaseRepository.auditIn), never through this repository.
 *
 * Both the Supabase (online/web) class and the offline SQLite class implement
 * this — the compiler keeps the two in lockstep.
 */
export interface IAuditRepository {
  /**
   * The recent trail. On native this reads the local mirror, which holds a
   * rolling 30-day window, so it works offline. On web it queries Supabase.
   */
  findRecent(filter: AuditFilter, page: number): Promise<DbAuditLog[]>;
  /**
   * The COMPLETE trail from the server, beyond the local window. Online only on
   * native: throws `RequiresConnectionError` when there is no connection.
   */
  findAll(filter: AuditFilter, page: number): Promise<DbAuditLog[]>;
  /**
   * One record's timeline, newest first. Reads the local window offline; when
   * `full` is set it fetches the record's whole history from the server
   * (online only on native).
   */
  findForRecord(table: string, recordId: string, full: boolean): Promise<DbAuditLog[]>;
}
