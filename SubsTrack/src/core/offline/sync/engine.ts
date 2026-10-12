import { supabase } from "@/src/shared/lib/supabase";
import { getDb, isOfflineDbReady } from "../db/sqlite";
import { nowIso } from "@shared/core/utils/ids";
import { isOnline } from "../net/connectivity";
import { IS_OFFLINE_CAPABLE } from "../platform";
import {
  getMeta,
  META_LAST_MANUAL_SYNC_AT,
  META_LAST_PULLED_AT,
  META_LAST_PUSH_AT,
  META_LAST_SYNC_AT,
  setMeta,
} from "./meta";
import { pruneWindowedTables, pullChanges } from "./pull";
import { pushDirty } from "./push";
import { getSyncStatus, setStatus, type SyncStatus } from "./status";

const PUSH_EVERY_MS = 5 * 60 * 1000;
const PULL_EVERY_MS = 10 * 60 * 1000;

type SyncStamp = "lastPushAt" | "lastPullAt" | "lastManualSyncAt";

const STAMP_KEYS: Record<SyncStamp, string> = {
  lastPushAt: META_LAST_PUSH_AT,
  lastPullAt: META_LAST_SYNC_AT,
  lastManualSyncAt: META_LAST_MANUAL_SYNC_AT,
};

let running: Promise<void> | null = null;
let pushing: Promise<void> | null = null;
let started = false;
let suspended = false;
let timers: ReturnType<typeof setInterval>[] = [];

/** Hold every cycle off during a restore — the pull releases the lock per page. */
export function suspendSync(): void {
  suspended = true;
}

/** Undo `suspendSync()`. Always call it from a `finally`. */
export function resumeSync(): void {
  suspended = false;
}

// A signed-out pull returns empty rows and would wipe the mirror — see docs/offline.md
async function canReachServer(): Promise<boolean> {
  if (!(await isOnline())) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

async function stamp(field: SyncStamp): Promise<void> {
  const at = nowIso();
  await setMeta(getDb(), STAMP_KEYS[field], at);
  const patch: Partial<SyncStatus> = {};
  patch[field] = at;
  setStatus(patch);
}

/** One sync cycle: push local changes up, then pull server changes down. Serialized. */
export async function runSync(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (suspended) return;
  if (running) return running;
  running = (async () => {
    await pushing?.catch(() => undefined);
    if (!(await canReachServer())) return;
    setStatus({ syncing: true, lastError: null });
    try {
      await pushDirty();
      await stamp("lastPushAt");
      const complete = await pullChanges();
      await pruneWindowedTables(getDb());
      if (complete) await stamp("lastPullAt");
      setStatus({
        syncing: false,
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

/** App-open trigger: pulls only when the last pull is older than the pull timer. */
export async function runSyncIfDue(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE || !isOfflineDbReady()) return;
  const last = await getMeta(getDb(), META_LAST_SYNC_AT);
  if (last && Date.now() - Date.parse(last) < PULL_EVERY_MS) {
    try {
      await flushPendingWrites();
    } catch {}
    return;
  }
  await runSync();
}

function restartTimers(): void {
  for (const timer of timers) clearInterval(timer);
  timers = [
    setInterval(
      () => void flushPendingWrites().catch(() => undefined),
      PUSH_EVERY_MS,
    ),
    setInterval(() => void runSync(), PULL_EVERY_MS),
  ];
}

async function runManualSync(): Promise<{ ok: boolean; offline: boolean }> {
  await runSync();
  if (started) restartTimers();
  const ok = getSyncStatus().lastError === null;
  if (ok) await stamp("lastManualSyncAt");
  return { ok, offline: false };
}

/** The Settings "Sync now" button — probes first so "offline" differs from "nothing to do". */
export async function syncNow(): Promise<{ ok: boolean; offline: boolean }> {
  if (!IS_OFFLINE_CAPABLE) return { ok: true, offline: false };
  if (!(await isOnline())) return { ok: false, offline: true };
  return runManualSync();
}

/** Push-only, never pulls: on logout the session may already be another tenant's. */
export async function flushPendingWrites(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE || suspended) return;
  if (running) return running;
  if (pushing) return pushing;
  pushing = (async () => {
    if (!(await canReachServer())) return;
    await pushDirty();
    await stamp("lastPushAt");
  })().finally(() => {
    pushing = null;
  });
  return pushing;
}

/** Repair a mirror that skipped rows: clear the pull cursor, run a normal cycle. */
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
  return runManualSync();
}

/** Cold start: one due-gated cycle, then push every 5 min and pull every 10 min. */
export async function startSync(cb: () => void): Promise<void> {
  if (!IS_OFFLINE_CAPABLE || started) return;
  started = true;
  if (isOfflineDbReady()) {
    const db = getDb();
    setStatus({
      lastPushAt: await getMeta(db, META_LAST_PUSH_AT),
      lastPullAt: await getMeta(db, META_LAST_SYNC_AT),
      lastManualSyncAt: await getMeta(db, META_LAST_MANUAL_SYNC_AT),
    });
  }
  await runSyncIfDue();
  restartTimers();
  cb();
}
