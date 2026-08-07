import type { AuditFilter, AuditRecordTarget, AuditSource } from '@/src/core/types';
import type { DbAuditLog } from '@/src/core/types/db';

/** Rows plus where they came from, so the UI can say which it is showing. */
export interface AuditRows {
  rows: DbAuditLog[];
  source: AuditSource;
}

/** One page of the trail. */
export interface AuditPage extends AuditRows {
  /**
   * More rows exist after this page. Decided by the repository, not the caller:
   * `rows` may carry this device's un-pushed entries on top of the fetched page,
   * so its length no longer reveals whether the page was full.
   */
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
  /** The filtered trail, newest first, one page at a time. */
  findRecent(filter: AuditFilter, page: number): Promise<AuditPage>;
  /** One record's timeline, newest first. Short by nature, so not paged. */
  findForRecord(table: string, recordId: string): Promise<AuditRows>;
  /**
   * The merged timeline of SEVERAL records, newest first — one entity whose story
   * spans more than one row (a customer plus its service lines and skipped months).
   *
   * Takes explicit `(table, id)` targets rather than a parent id because the trail
   * stores no parent link: an entry knows its own table and record id, nothing more.
   * The caller therefore resolves the children it cares about and passes them in.
   * An empty `targets` returns no rows without querying.
   */
  findForRecords(targets: AuditRecordTarget[]): Promise<AuditRows>;
  /**
   * Everything ever recorded about ONE customer, newest first, across the given
   * tables — the customer row, its service lines, its payments, its skips.
   *
   * Keys off the frozen `subject_id` instead of a list of child ids: a caller
   * cannot enumerate skipped-month ids (hashed natural key), and a long-standing
   * customer has hundreds of payments, which would not fit in one query anyway.
   * `tables` is the caller's choice of what belongs in the story.
   */
  findForCustomer(customerId: string, tables: string[]): Promise<AuditRows>;
}
