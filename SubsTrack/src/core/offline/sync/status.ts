/** What the UI can show about the last/ongoing sync. */
export interface SyncStatus {
  syncing: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastManualSyncAt: string | null;
  lastError: string | null;
  outdated: boolean;
}

let status: SyncStatus = {
  syncing: false,
  lastPushAt: null,
  lastPullAt: null,
  lastManualSyncAt: null,
  lastError: null,
  outdated: false,
};
const listeners = new Set<(s: SyncStatus) => void>();

/** Update the status and notify subscribers. */
export function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

/** Current status snapshot (no subscription). */
export function getSyncStatus(): SyncStatus {
  return status;
}

/** Subscribe to status changes; returns an unsubscribe function. */
export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
