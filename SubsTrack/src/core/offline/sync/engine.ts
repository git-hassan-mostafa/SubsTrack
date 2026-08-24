// Orchestration + triggers: one cycle is push → pull → prune, serialized.

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

/** How stale the mirror may get before a background refresh re-syncs it. */
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

let running: Promise<void> | null = null;
let started = false;

/** One sync cycle: push local changes up, then pull server changes down. Serialized. */
export async function runSync(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (running) return running; // only one cycle at a time
  running = (async () => {
    if (!(await isOnline())) return; // nothing to do offline
    // Never sync while signed out. A logged-out pull returns empty rows (RLS, no
    // error), which would make reconcileDeletes read "everything was deleted" and
    // wipe the whole local mirror. getSession() is a local read (no network).
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    setStatus({ syncing: true, lastError: null });
    try {
      await pushDirty();
      const complete = await pullChanges();
      // After push, so a pruned-away row was already sent up.
      await pruneWindowedTables(getDb());
      // The durable twin of `lastSyncAt` below — it outlives the process, which is
      // what `runSyncIfDue` gates on. Only a COMPLETE cycle counts, so a partial
      // one is retried at the next app open instead of waiting out the interval.
      if (complete) await setMeta(getDb(), META_LAST_SYNC_AT, nowIso());
      // Only stamp a successful lastSyncAt when the cycle fully completed; a
      // partial cycle records `sync_incomplete` so the UI can stop claiming success
      // and the next tick retries. Not localized — read via the `ok` flag, never shown raw.
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
  // Callers fire this and forget, so it must never reject: check the handle
  // rather than letting getDb() throw at an unawaited call site.
  if (!IS_OFFLINE_CAPABLE || !isOfflineDbReady()) return;
  const last = await getMeta(getDb(), META_LAST_SYNC_AT);
  // An unparseable stamp gives NaN, which fails this test and syncs — the safe way round.
  if (last && Date.now() - Date.parse(last) < SYNC_INTERVAL_MS) {
    // Fresh enough to skip the PULL, never to skip the PUSH: an un-pushed row is
    // the only copy of that money in existence, so it must not wait out the day.
    // Costs nothing when nothing is dirty (pushTable returns on an empty select).
    try {
      await flushPendingWrites();
    } catch {
      /* best-effort — the rows stay dirty and go up on the next cycle */
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
  // The in-memory status starts blank each launch — seed it from the durable
  // stamp so "last synced" survives a restart, like the gate it shares.
  if (isOfflineDbReady()) {
    setStatus({ lastSyncAt: await getMeta(getDb(), META_LAST_SYNC_AT) });
  }
  await runSyncIfDue();
  cb();
}
