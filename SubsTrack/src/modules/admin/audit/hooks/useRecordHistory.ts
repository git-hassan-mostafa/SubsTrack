import { useCallback, useEffect, useMemo, useState } from 'react';
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

/**
 * The change timeline for one entity, for a History sheet. Pass one target for a
 * single row (a payment), or several to merge an entity that spans tables — a
 * customer plus its service lines and skipped months, newest first across all.
 *
 * Local to the component on purpose, unlike the admin screen's filter session which
 * lives in the audit slice: this is per-entity, transient, and thrown away when the
 * sheet closes. Holding it in the store meant a second parallel set of fields
 * (`recordItems`/`recordLoading`/`recordError`) that two open sheets would fight
 * over, plus a manual clear on close that was easy to forget.
 *
 * Starts on the device's 30-day window so it works offline; `loadFull()` re-fetches
 * the complete history (online-only on native — the error surfaces in `error`).
 */
export function useRecordHistory(targets: AuditRecordTarget[]): RecordHistoryState {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  // Callers build the array inline, so a new identity arrives every render and
  // depending on it directly would re-fetch forever. `key` is its CONTENTS, and the
  // array is rebuilt from that key — so the effect depends only on real changes.
  // (Not an eslint-disable: those switch React Compiler off for the whole file.)
  const key = targets.map((tr) => `${tr.table}:${tr.recordId}`).join('|');
  const stableTargets = useMemo<AuditRecordTarget[]>(
    () =>
      key
        ? key.split('|').map((pair) => {
            const [table, recordId] = pair.split(':');
            return { table, recordId } as AuditRecordTarget;
          })
        : [],
    [key],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    auditService
      .getRecordsHistory(stableTargets, full)
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
  }, [stableTargets, full]);

  const loadFull = useCallback(() => setFull(true), []);

  return { entries, loading, error, full, loadFull };
}
