import { AppState } from 'react-native';
import { IS_OFFLINE_CAPABLE } from '../platform';
import { isOnline, subscribeConnectivity } from '../net/connectivity';
import { pushOutbox } from './push';
import { pullAll } from './pull';
import { nowIso } from '../ids';

/** Observable sync state so the UI can show a "syncing" indicator. */
export interface SyncStatus {
  syncing: boolean;
  lastSyncAt: string | null; // ISO of the last successful cycle
  lastError: string | null; // message of the last failed cycle (null while syncing / after success)
}

let status: SyncStatus = { syncing: false, lastSyncAt: null, lastError: null };
const listeners = new Set<(s: SyncStatus) => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

/** Current sync status snapshot (no subscription). */
export function getSyncStatus(): SyncStatus {
  return status;
}

/** Subscribe to sync-status changes; returns an unsubscribe fn. */
export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

let running: Promise<void> | null = null;
let started = false;

/** One full sync cycle — push the outbox, then pull server truth. Serialized. */
export async function runSync(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (running) return running; // single in-flight run
  running = (async () => {
    if (!(await isOnline())) return;
    setStatus({ syncing: true, lastError: null });
    try {
      await pushOutbox();
      await pullAll();
      setStatus({ syncing: false, lastSyncAt: nowIso(), lastError: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[offline] sync failed:', message);
      setStatus({ syncing: false, lastError: message });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Manually trigger a sync (from a UI button). Unlike `runSync`, this probes
 * connectivity first and surfaces an offline result so the UI can tell the
 * difference between "nothing to do" and "can't reach the server".
 */
export async function syncNow(): Promise<{ ok: boolean; offline: boolean }> {
  if (!IS_OFFLINE_CAPABLE) return { ok: true, offline: false };
  if (!(await isOnline())) return { ok: false, offline: true };
  await runSync();
  return { ok: status.lastError === null, offline: false };
}

let debounce: ReturnType<typeof setTimeout> | null = null;

/** Debounced kick after a local write. No-op offline — the next reconnect retries. */
export function requestSync(delayMs = 800): void {
  if (!IS_OFFLINE_CAPABLE) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    void runSync();
  }, delayMs);
}

/** Register connectivity / foreground / periodic sync triggers. Idempotent. */
export function startSyncEngine(): void {
  if (!IS_OFFLINE_CAPABLE || started) return;
  started = true;
  subscribeConnectivity((online) => {
    if (online) void runSync();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void runSync();
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void runSync();
  }, 90_000);
  void runSync();
}
