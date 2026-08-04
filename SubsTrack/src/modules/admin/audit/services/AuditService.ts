import { Platform } from 'react-native';
import { OFFLINE_PAGE_SIZE, PAGE_SIZE } from '@/src/core/constants';
import type { AuditEntry, AuditFilter } from '@/src/core/types';
import repository from '../repository/AuditRepository';
import { mapDbAuditLogToAuditEntry } from '../utils/mapper';

/**
 * Rows returned per page, which differs by where the page came from: the local
 * SQLite window pages at OFFLINE_PAGE_SIZE, every Supabase query at PAGE_SIZE.
 * Callers must compare a page's length against THIS to decide "is there more" —
 * a hardcoded PAGE_SIZE would make the native local list stop after one page.
 */
export function auditPageSize(scope: 'local' | 'full'): number {
  // 'full' always comes from Supabase, even on native (the offline repo delegates).
  return scope === 'local' && Platform.OS !== 'web' ? OFFLINE_PAGE_SIZE : PAGE_SIZE;
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
 * `scope` decides where the entries come from:
 *   'local' — the device's rolling 30-day window (works offline)
 *   'full'  — the complete server-side history (needs a connection on native)
 */
class AuditService {
  async getEntries(
    filter: AuditFilter,
    page = 0,
    scope: 'local' | 'full' = 'local',
  ): Promise<AuditEntry[]> {
    const rows =
      scope === 'full'
        ? await repository.findAll(filter, page)
        : await repository.findRecent(filter, page);
    return rows.map(mapDbAuditLogToAuditEntry);
  }

  /** One record's timeline, newest first. */
  async getRecordHistory(table: string, recordId: string, full = false): Promise<AuditEntry[]> {
    const rows = await repository.findForRecord(table, recordId, full);
    return rows.map(mapDbAuditLogToAuditEntry);
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
