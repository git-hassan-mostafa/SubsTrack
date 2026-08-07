import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry, AuditRecordTarget } from '@/src/core/types';
import auditService from '../services/AuditService';

interface RecordHistoryState {
  entries: AuditEntry[];
  loading: boolean;
  error: string | null;
  /** True once the caller asked for the complete server-side history. */
  full: boolean;
  loadFull: () => void;
}

/** Loads one timeline. Module-level, so the effect below has a stable dependency. */
type Loader = (key: string, full: boolean) => Promise<AuditEntry[]>;

const loadTargets: Loader = (key, full) =>
  auditService.getRecordsHistory(
    key
      ? key.split('|').map((pair) => {
          const [table, recordId] = pair.split(':');
          return { table, recordId } as AuditRecordTarget;
        })
      : [],
    full,
  );

const loadCustomer: Loader = (customerId, full) =>
  auditService.getCustomerHistory(customerId, full);

/**
 * The fetch/loading/error machinery both History hooks share. `key` is a plain
 * string identifying what to load — callers must not pass an object, or a new
 * identity every render would re-fetch forever.
 *
 * Starts on the device's 30-day window so it works offline; `loadFull()`
 * re-fetches the complete history (online-only on native — the error surfaces
 * in `error`).
 */
function useAuditTimeline(key: string, load: Loader): RecordHistoryState {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load(key, full)
      .then((rows) => {
        // The sheet can close, or `full` flip, before a slow fetch lands.
        if (active) setEntries(rows);
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
  }, [key, full, load]);

  const loadFull = useCallback(() => setFull(true), []);

  return { entries, loading, error, full, loadFull };
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
