import { supabase } from "@/src/shared/lib/supabase";
import { getDb, isOfflineDbReady } from "../db/sqlite";
import { nowIso } from "@shared/core/utils/ids";
import { OPTION_KEYS } from "@shared/modules/options/utils/constants";
import { isClientOutdated } from "@shared/modules/options/utils/clientVersion";
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
import { setStatus, type SyncStatus } from "./status";
import { isTenantInactive } from "./tenantActive";

const PUSH_EVERY_MS = 10 * 60 * 1000;
const PULL_GATE_MS = 10 * 60 * 1000;

type SyncStamp = "lastPushAt" | "lastPullAt" | "lastManualSyncAt";

const STAMP_KEYS: Record<SyncStamp, string> = {
  lastPushAt: META_LAST_PUSH_AT,
  lastPullAt: META_LAST_SYNC_AT,
  lastManualSyncAt: META_LAST_MANUAL_SYNC_AT,
};

let running: Promise<boolean> | null = null;
let pushing: Promise<void> | null = null;
let started = false;
let suspended = false;
let pushTimer: ReturnType<typeof setInterval> | null = null;

/** Hold every cycle off during a restore — the pull releases the lock per page. */
export function suspendSync(): void {
  suspended = true;
}

/** Undo `suspendSync()`. Always call it from a `finally`. */
export function resumeSync(): void {
  suspended = false;
}

// A failed read never blocks: only a MinClientVersion above this build's stops sync.
async function isAppOutdated(): Promise<boolean> {
  const { data } = await supabase
    .from("app_options")
    .select("value")
    .eq("key", OPTION_KEYS.minClientVersion)
    .maybeSingle();
  return isClientOutdated((data as { value: string | null } | null)?.value);
}

// A signed-out pull returns empty rows and would wipe the mirror — see docs/offline.md
async function canReachServer(): Promise<boolean> {
  if (!(await isOnline())) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const [outdated, tenantInactive] = await Promise.all([
    isAppOutdated(),
    isTenantInactive(),
  ]);
  setStatus({ outdated, tenantInactive });
  return !outdated && !tenantInactive;
}

async function stamp(field: SyncStamp): Promise<void> {
  const at = nowIso();
  await setMeta(getDb(), STAMP_KEYS[field], at);
  const patch: Partial<SyncStatus> = {};
  patch[field] = at;
  setStatus(patch);
}

// Push, then pull; serialized. True only when it reached the server and finished.
export async function runSync(): Promise<boolean> {
  if (!IS_OFFLINE_CAPABLE) return false;
  if (suspended) return false;
  if (running) return running;
  running = (async () => {
    await pushing?.catch(() => undefined);
    if (!(await canReachServer())) return false;
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
      return complete;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[sync] failed:", message);
      setStatus({ syncing: false, lastError: message });
      return false;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

// The only automatic pull (app open); a fresh pull still pushes — see offline.md
export async function runSyncIfDue(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE || !isOfflineDbReady()) return;
  const last = await getMeta(getDb(), META_LAST_SYNC_AT);
  if (last && Date.now() - Date.parse(last) < PULL_GATE_MS) {
    try {
      await flushPendingWrites();
    } catch {}
    return;
  }
  await runSync();
}

function restartPushTimer(): void {
  if (pushTimer) clearInterval(pushTimer);
  pushTimer = setInterval(
    () => void flushPendingWrites().catch(() => undefined),
    PUSH_EVERY_MS,
  );
}

async function runManualSync(): Promise<{ ok: boolean; offline: boolean }> {
  const ok = await runSync();
  if (started) restartPushTimer();
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
  if (running) {
    await running;
    return;
  }
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

// Cold start: one due-gated cycle, then a push every 10 min; no timed pull.
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
  restartPushTimer();
  cb();
}
