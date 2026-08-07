import type { AuditEntry, AuditFilter, AuditRecordTarget, AuditSource } from '@/src/core/types';
import repository from '../repository/AuditRepository';
import { CUSTOMER_HISTORY_TABLES } from '../utils/constants';
import { mapDbAuditLogToAuditEntry } from '../utils/mapper';

/** Entries plus where they came from — see AuditSource. */
export interface AuditEntries {
  entries: AuditEntry[];
  source: AuditSource;
}

/** One page of the trail. `hasMore` comes from the repository (see AuditPage). */
export interface AuditEntryPage extends AuditEntries {
  hasMore: boolean;
}

/** One day's entries, for a section-grouped list. */
export interface AuditDayGroup {
  /** YYYY-MM-DD, the local calendar day the entries happened on. */
  day: string;
  entries: AuditEntry[];
}

/**
 * Business layer over the audit trail. Read-only by design: entries are appended
 * by each repository next to the change it made, so there is no create path here.
 *
 * Every read is the complete server-side history with this device's un-pushed
 * entries merged in; with no connection it degrades to the local 30-day window and
 * says so through `source`. Nothing here chooses — the repository decides and
 * reports what it managed to read.
 */
class AuditService {
  async getEntries(filter: AuditFilter, page = 0): Promise<AuditEntryPage> {
    const { rows, source, hasMore } = await repository.findRecent(filter, page);
    return { entries: rows.map(mapDbAuditLogToAuditEntry), source, hasMore };
  }

  /** One record's timeline, newest first. */
  async getRecordHistory(table: string, recordId: string): Promise<AuditEntries> {
    const { rows, source } = await repository.findForRecord(table, recordId);
    return { entries: rows.map(mapDbAuditLogToAuditEntry), source };
  }

  /**
   * The merged timeline of several rows that make up one entity — a customer plus
   * its service lines and skipped months. Newest first across all of them, so the
   * result reads as one story rather than per-table sections.
   */
  async getRecordsHistory(targets: AuditRecordTarget[]): Promise<AuditEntries> {
    const { rows, source } = await repository.findForRecords(targets);
    return { entries: rows.map(mapDbAuditLogToAuditEntry), source };
  }

  /**
   * One customer's whole timeline — profile, service lines, month payments and
   * skips — newest first. Filtered on the entry's frozen `subject_id`, so it needs
   * no list of child ids and picks up rows whose record has since been deleted.
   */
  async getCustomerHistory(customerId: string): Promise<AuditEntries> {
    const { rows, source } = await repository.findForCustomer(customerId, CUSTOMER_HISTORY_TABLES);
    return { entries: rows.map(mapDbAuditLogToAuditEntry), source };
  }

  /**
   * Group entries into calendar days, preserving the newest-first order they
   * arrive in. Grouping by the LOCAL day (not the ISO prefix) so an entry made at
   * 11pm doesn't jump to tomorrow for a viewer east of UTC.
   */
  groupByDay(entries: AuditEntry[]): AuditDayGroup[] {
    const groups: AuditDayGroup[] = [];
    for (const entry of entries) {
      const d = new Date(entry.occurredAt);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.entries.push(entry);
      else groups.push({ day, entries: [entry] });
    }
    return groups;
  }
}

export default new AuditService();
