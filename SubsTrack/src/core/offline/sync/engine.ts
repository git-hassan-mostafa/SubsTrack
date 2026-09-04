import { supabase } from "@/src/shared/lib/supabase";
import { getDb, isOfflineDbReady } from "../db/sqlite";
import { nowIso } from "../ids";
import { isOnline } from "../net/connectivity";
import { IS_OFFLINE_CAPABLE } from "../platform";
import {
  getMeta,
  META_LAST_PULLED_AT,
  META_LAST_SYNC_AT,
  setMeta,
} from "./meta";
import { pruneWindowedTables, pullChanges } from "./pull";
import { pushDirty } from "./push";
import { getSyncStatus, setStatus } from "./status";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

let running: Promise<void> | null = null;
let started = false;

/** One sync cycle: push local changes up, then pull server changes down. Serialized. */
export async function runSync(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (running) return running;
  running = (async () => {
    if (!(await isOnline())) return;
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    setStatus({ syncing: true, lastError: null });
    try {
      await pushDirty();
      const complete = await pullChanges();
      await pruneWindowedTables(getDb());
      if (complete) await setMeta(getDb(), META_LAST_SYNC_AT, nowIso());
      setStatus({
        syncing: false,
        lastSyncAt: complete ? nowIso() : getSyncStatus().lastSyncAt,
        lastError: complete ? null : "sync_incomplete",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[sync] failed:", message);
      setStatus({ syncing: false, lastError: message });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * THE APP-OPEN TRIGGER — a cycle only when the mirror is a day stale. Both halves
 * of "the app was opened" go through it: `startSync` at cold start and
 * `getUserProfile` on every session restore, so an unconditional cycle would
 * re-sync several times a day for nothing. The stamp lives in `sync_meta`, not in
 * the in-memory status, so it survives a restart; `wipeOfflineData` clears it
 * together with the pull cursor so a just-wiped mirror can never read as fresh.
 * Manual sync (`syncNow` / `resyncFromScratch`) ignores this gate entirely.
 */
export async function runSyncIfDue(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE || !isOfflineDbReady()) return;
  const last = await getMeta(getDb(), META_LAST_SYNC_AT);
  if (last && Date.now() - Date.parse(last) < SYNC_INTERVAL_MS) {
    try {
      await flushPendingWrites();
    } catch {
    }
    return;
  }
  await runSync();
}

/**
 * Manual trigger (the Settings "Sync now" button). Probes connectivity first so
 * the UI can tell "offline" apart from "nothing to do".
 */
export async function syncNow(): Promise<{ ok: boolean; offline: boolean }> {
  if (!IS_OFFLINE_CAPABLE) return { ok: true, offline: false };
  if (!(await isOnline())) return { ok: false, offline: true };
  await runSync();
  return { ok: getSyncStatus().lastError === null, offline: false };
}

/**
 * Push-only flush — used on logout to send un-pushed local writes up while the
 * session is still valid, WITHOUT pulling. Pulling here would be wrong: during a
 * blocked tenant switch the session is already the new tenant's, so a pull would
 * merge the new tenant's rows into the old tenant's mirror. Best-effort and quiet:
 * offline / signed-out → no-op; a rejected row simply stays `_dirty` for later.
 */
export async function flushPendingWrites(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (!(await isOnline())) return;
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return;
  await pushDirty();
}

/**
 * Recovery: forget the pull position and pull the whole tenant again. The normal
 * cycle still runs push→pull, so un-synced local writes go up first; then, with
 * the cursor cleared, the pull re-fetches and re-merges every row. Non-destructive
 * — `_dirty` local rows still win the merge. Use it to repair a mirror whose
 * incremental pull skipped rows. Same return shape as `syncNow()`.
 */
export async function resyncFromScratch(): Promise<{
  ok: boolean;
  offline: boolean;
}> {
  if (!IS_OFFLINE_CAPABLE) return { ok: true, offline: false };
  if (!(await isOnline())) return { ok: false, offline: true };
  const db = getDb();
  await db.runAsync("DELETE FROM sync_meta WHERE key = ?", [
    META_LAST_PULLED_AT,
  ] as never[]);
  await runSync();
  return { ok: getSyncStatus().lastError === null, offline: false };
}

/**
 * Register the sync triggers (idempotent). Deliberately calm: one cycle at cold
 * start, and only when the mirror is a day stale (`runSyncIfDue` — the app-open
 * gate; the session restore behind it hits the same one). Local writes land
 * durably in SQLite; the next trigger pushes them.
 */
export async function startSync(cb: () => void): Promise<void> {
  if (!IS_OFFLINE_CAPABLE || started) return;
  started = true;
  if (isOfflineDbReady()) {
    setStatus({ lastSyncAt: await getMeta(getDb(), META_LAST_SYNC_AT) });
  }
  await runSyncIfDue();
  cb();
}
