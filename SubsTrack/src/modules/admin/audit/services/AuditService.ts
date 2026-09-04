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

  async getRecordHistory(table: string, recordId: string): Promise<AuditEntries> {
    const { rows, source } = await repository.findForRecord(table, recordId);
    return { entries: rows.map(mapDbAuditLogToAuditEntry), source };
  }

  async getRecordsHistory(targets: AuditRecordTarget[]): Promise<AuditEntries> {
    const { rows, source } = await repository.findForRecords(targets);
    return { entries: rows.map(mapDbAuditLogToAuditEntry), source };
  }

  async getCustomerHistory(customerId: string): Promise<AuditEntries> {
    const { rows, source } = await repository.findForCustomer(customerId, CUSTOMER_HISTORY_TABLES);
    return { entries: rows.map(mapDbAuditLogToAuditEntry), source };
  }

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
