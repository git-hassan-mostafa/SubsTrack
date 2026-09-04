import type { AuditFilter, AuditRecordTarget, AuditSource } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';

/** Rows plus where they came from, so the UI can say which it is showing. */
export interface AuditRows {
  rows: DbAuditLog[];
  source: AuditSource;
}

/** One page of the trail. */
export interface AuditPage extends AuditRows {
  hasMore: boolean;
}

/**
 * The audit-trail READ contract. Writes are not here: entries are appended by
 * each repository next to the change it made (BaseRepository.audit /
 * OfflineBaseRepository.auditIn), never through this repository.
 *
 * Every read returns the SERVER's rows with this device's un-pushed ones merged
 * in, falling back to the local 30-day window when the server can't be reached.
 * There is no caller-chosen scope — see docs/features.md → Audit Trail.
 *
 * Both the Supabase (online/web) class and the offline SQLite class implement
 * this — the compiler keeps the two in lockstep.
 */
export interface IAuditRepository {
  findRecent(filter: AuditFilter, page: number): Promise<AuditPage>;
  findForRecord(table: string, recordId: string): Promise<AuditRows>;
  findForRecords(targets: AuditRecordTarget[]): Promise<AuditRows>;
  findForCustomer(customerId: string, tables: string[]): Promise<AuditRows>;
}
