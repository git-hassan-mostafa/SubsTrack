import { useEffect, useState } from 'react';
import type { AuditEntry, AuditRecordTarget, AuditSource } from '@/src/core/types';
import auditService, { type AuditEntries } from '../services/AuditService';

export interface RecordHistoryState {
  entries: AuditEntry[];
  loading: boolean;
  error: string | null;
  /** Where the entries came from — the server, or the local window as a fallback. */
  source: AuditSource;
}

/** Loads one timeline. Module-level, so the effect below has a stable dependency. */
type Loader = (key: string) => Promise<AuditEntries>;

const loadTargets: Loader = (key) =>
  auditService.getRecordsHistory(
    key
      ? key.split('|').map((pair) => {
          const [table, recordId] = pair.split(':');
          return { table, recordId } as AuditRecordTarget;
        })
      : [],
  );

const loadCustomer: Loader = (customerId) => auditService.getCustomerHistory(customerId);

/**
 * The fetch/loading/error machinery both History hooks share. `key` is a plain
 * string identifying what to load — callers must not pass an object, or a new
 * identity every render would re-fetch forever.
 *
 * Loads the complete server-side history straight away (with this device's
 * un-pushed entries merged in), and degrades to the local 30-day window when there
 * is no connection — reported through `source`, never asked for.
 */
function useAuditTimeline(key: string, load: Loader): RecordHistoryState {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<AuditSource>('server');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load(key)
      .then((result) => {
        // The sheet can close before a slow fetch lands.
        if (!active) return;
        setEntries(result.entries);
        setSource(result.source);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, load]);

  return { entries, loading, error, source };
}

/**
 * The change timeline for one entity, for a History sheet. Pass one target for a
 * single row (a payment), or several to merge an entity that spans tables.
 *
 * Local to the component on purpose, unlike the admin screen's filter session which
 * lives in the audit slice: this is per-entity, transient, and thrown away when the
 * sheet closes. Holding it in the store meant a second parallel set of fields
 * (`recordItems`/`recordLoading`/`recordError`) that two open sheets would fight
 * over, plus a manual clear on close that was easy to forget.
 */
export function useRecordHistory(targets: AuditRecordTarget[]): RecordHistoryState {
  // Callers build the array inline, so a new identity arrives every render. The
  // key is its CONTENTS; `loadTargets` parses it back, so the effect depends only
  // on real changes. (Not an eslint-disable: those switch React Compiler off for
  // the whole file.)
  return useAuditTimeline(targets.map((tr) => `${tr.table}:${tr.recordId}`).join('|'), loadTargets);
}

/**
 * One customer's whole timeline — the profile row, its service lines, and the
 * month payments / skips on them. Keyed on the entries' frozen `subject_id`, so
 * unlike `useRecordHistory` the caller needs no list of child ids.
 */
export function useCustomerHistory(customerId: string): RecordHistoryState {
  return useAuditTimeline(customerId, loadCustomer);
}
