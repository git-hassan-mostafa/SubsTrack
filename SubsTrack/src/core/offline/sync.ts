// The whole offline sync engine, kept intentionally small.
//
//   push  → send every locally-changed row (and hard deletes) up to Supabase
//   pull  → bring rows the server changed since our last pull down to SQLite
//   rule  → on conflict the latest `updated_at` wins
//
// There is no outbox, no per-table cursor, no tombstone table. A row that
// changed locally carries a `_dirty = 1` flag (set by the dml write helpers);
// a hard-deleted row is logged in `pending_deletes`; the last pull position is
// one `last_pulled_at` value in `sync_meta`. That is the entire bookkeeping.

import { AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '@/src/shared/lib/supabase';
import { IS_OFFLINE_CAPABLE } from './platform';
import { isOnline, subscribeConnectivity } from './net/connectivity';
import { getDb } from './db/sqlite';
import { decodeRow } from './db/codec';
import { upsertFromServer } from './db/dml';
import { TABLE_BY_NAME, SYNC_PULL_ORDER } from './db/tables';
import { nowIso } from './ids';

// ── Observable status (drives the UI "syncing" indicator) ────────────────────

/** What the UI can show about the last/ongoing sync. */
export interface SyncStatus {
  syncing: boolean;
  lastSyncAt: string | null; // ISO of the last successful cycle
  lastError: string | null; // message of the last failed cycle (cleared on success)
}

let status: SyncStatus = { syncing: false, lastSyncAt: null, lastError: null };
const listeners = new Set<(s: SyncStatus) => void>();

/** Update the status and notify subscribers. */
function setStatus(patch: Partial<SyncStatus>): void {
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

// ── Tiny key/value meta (the `sync_meta` table) ──────────────────────────────

export const META_ACTIVE_TENANT = 'active_tenant_id'; // which tenant the mirror holds
export const META_ACTIVE_BRANCH_SCOPE = 'active_branch_scope'; // which branch view (tenant-wide vs one branch) the mirror was pulled under
const META_LAST_PULLED_AT = 'last_pulled_at'; // newest server updated_at we've pulled

/** Read a meta value (null if unset). */
export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key] as never[],
  );
  return r?.value ?? null;
}

/** Write a meta value (insert or replace). */
export async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value] as never[],
  );
}

// ── PUSH: local changes → Supabase ───────────────────────────────────────────

/**
 * Remove columns the server owns from a push payload:
 *  - `updated_at` is set by a Postgres trigger (and is null for locally-created
 *    plans), so we never send it — the pull reads back the server's value.
 *  - `generated` columns (payments.balance, sales.total_amount) are rejected by
 *    Postgres if a value is provided.
 */
function stripForPush(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  delete out.updated_at;
  for (const c of TABLE_BY_NAME[table]?.generated ?? []) delete out[c];
  return out;
}

/**
 * The upsert conflict key. Payments converge on their natural key (one payment
 * per service line per month); every other table converges on its primary key.
 */
function conflictTarget(table: string): string {
  return table === 'payments' ? 'customer_plan_id,billing_month' : 'id';
}

/**
 * Send everything that changed locally up to Supabase, then replay hard deletes.
 * Upserts go parents-before-children so the server's foreign keys are satisfied.
 * A row/table that fails is left dirty and simply retried on the next sync.
 */
async function pushDirty(): Promise<void> {
  const db = getDb();

  // 1. Upserts — every row flagged `_dirty` (created / edited / soft-deleted).
  for (const table of SYNC_PULL_ORDER) {
    if (TABLE_BY_NAME[table]?.scope !== 'tenant') continue; // global tables are read-only caches
    const raw = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE _dirty = 1`,
    );
    if (raw.length === 0) continue;

    const rows = raw.map((r) => stripForPush(table, decodeRow(table, r)));
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictTarget(table) });
    if (error) {
      console.warn(`[sync] push ${table} failed:`, error.message); // stays dirty → retried next sync
      continue;
    }

    // Clear the flag only for the exact rows we just pushed (a row edited during
    // the network call keeps its flag and syncs next time).
    const ids = raw.map((r) => r.id as string);
    const ph = ids.map(() => '?').join(', ');
    await db.runAsync(`UPDATE ${table} SET _dirty = 0 WHERE id IN (${ph})`, ids as never[]);
  }

  // 2. Hard deletes — replay each logged (table, id) as a real server delete
  //    (server foreign keys cascade to children). Drop the log entry on success.
  const dels = await db.getAllAsync<{ table_name: string; row_id: string }>(
    'SELECT table_name, row_id FROM pending_deletes',
  );
  for (const d of dels) {
    const { error } = await supabase.from(d.table_name).delete().eq('id', d.row_id);
    if (error) {
      console.warn(`[sync] delete ${d.table_name} failed:`, error.message); // retried next sync
      continue;
    }
    await db.runAsync('DELETE FROM pending_deletes WHERE table_name = ? AND row_id = ?', [
      d.table_name,
      d.row_id,
    ] as never[]);
  }
}

// ── PULL: Supabase → local (last-write-wins) ─────────────────────────────────

const PAGE = 1000; // PostgREST default cap; page through anything larger

/**
 * Pull rows the server changed since our last pull and merge them into the
 * mirror. "Latest updated_at wins": we only fetch rows newer than `last_pulled_at`
 * and we never overwrite a row that still has an un-pushed local edit (`_dirty = 1`).
 * Then reconcile hard deletes for the low-volume tables. Returns `true` only when
 * the whole cycle (every table + delete reconcile) succeeded.
 */
async function pullChanges(): Promise<boolean> {
  const db = getDb();
  const startedAt = await getMeta(db, META_LAST_PULLED_AT); // null on the very first sync
  let newMax = startedAt;
  // The cursor is shared by every table, so it must only ever move forward once
  // EVERY table has been pulled up to that point. If a single table fails this
  // cycle we hold the cursor back — otherwise a newer row from a table that DID
  // succeed would push the cursor past the failed table's un-pulled rows, and
  // `updated_at > cursor` would hide them from every future pull forever.
  let complete = true;

  for (const table of SYNC_PULL_ORDER) {
    if (TABLE_BY_NAME[table]?.pushOnly) continue; // e.g. exception_logs — push up, never pull down

    try {
      // Offset-page over a STABLE predicate (`updated_at > startedAt`), ordered by
      // (updated_at, id). Keyset paging on updated_at alone would silently drop
      // rows whenever more than PAGE rows share a single timestamp — which the
      // migration backfill (every existing row stamped with one transaction NOW())
      // and any bulk insert guarantee. `id` is the deterministic tiebreaker.
      for (let offset = 0; ; offset += PAGE) {
        let q = supabase
          .from(table)
          .select('*')
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (startedAt) q = q.gt('updated_at', startedAt);

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as Record<string, unknown>[];
        if (rows.length === 0) break;

        await db.withTransactionAsync(async () => {
          for (const row of rows) {
            // A row with an un-pushed local edit wins until it's pushed — skip it.
            const local = await db.getFirstAsync<{ _dirty: number }>(
              `SELECT _dirty FROM ${table} WHERE id = ?`,
              [row.id as string] as never[],
            );
            if (local?._dirty === 1) continue;
            await upsertFromServer(db, table, row);
          }
        });

        const pageMax = rows[rows.length - 1].updated_at as string;
        if (!newMax || pageMax > newMax) newMax = pageMax; // ISO8601 strings sort chronologically
        if (rows.length < PAGE) break;
      }
    } catch (e) {
      // Request error or a merge failure — skip this table this cycle and keep
      // the cursor pinned (see `complete` above). Retried on the next cycle.
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[sync] pull ${table} failed:`, message);
      complete = false;
    }
  }

  // Advance the single pull position only when the WHOLE cycle succeeded, so the
  // cursor can never outrun a table that failed. A partial cycle leaves the old
  // cursor in place; the next cycle re-pulls from the same point (upserts are
  // idempotent) and can still reach the stranded rows.
  if (complete && newMax && newMax !== startedAt) {
    await setMeta(db, META_LAST_PULLED_AT, newMax);
  }

  const reconciled = await reconcileDeletes(db);
  return complete && reconciled;
}

// Tables whose rows can be PERMANENTLY deleted (everything else is soft-voided).
// A hard delete leaves no updated_at to pull, so we compare id lists to drop rows
// that were deleted on another device / the web app. Ledger tables (payments,
// sales, debts) are only voided, never hard-deleted, so they're skipped.
const DELETE_RECONCILE_TABLES = ['customers', 'plans', 'branches', 'currencies', 'products'];

/**
 * Drop local rows that no longer exist on the server (a delete done elsewhere).
 * Only touches already-synced rows (`_dirty = 0`) so an un-pushed local create is
 * never mistaken for a remote delete. Returns `false` if any table's id list could
 * not be fetched (so the cycle is reported incomplete rather than silently partial).
 */
async function reconcileDeletes(db: SQLiteDatabase): Promise<boolean> {
  let ok = true;
  for (const table of DELETE_RECONCILE_TABLES) {
    // Page the id list. An unpaged select is capped at PAGE rows by PostgREST, so
    // for a table with more than PAGE rows every id past the cap would look
    // "missing" and its local row would be wrongly deleted.
    const serverIds = new Set<string>();
    let failed = false;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[sync] delete-reconcile ${table} failed:`, error.message);
        failed = true;
        break;
      }
      const rows = (data ?? []) as { id: string }[];
      for (const r of rows) serverIds.add(r.id);
      if (rows.length < PAGE) break;
    }
    if (failed) {
      ok = false;
      continue;
    }

    const localIds = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table} WHERE _dirty = 0`);
    // Never mass-delete on an empty server list: an empty result is ambiguous —
    // "every row really was deleted" vs. "nothing is visible" (the session is gone,
    // or RLS returned nothing). Deleting here would wipe the whole local table;
    // skipping only risks a little staleness, and it reconciles once ≥1 row shows.
    if (serverIds.size === 0 && localIds.length > 0) continue;

    for (const { id } of localIds) {
      if (!serverIds.has(id)) {
        await db.runAsync(`DELETE FROM ${table} WHERE id = ? AND _dirty = 0`, [id] as never[]);
      }
    }
  }
  return ok;
}

// ── Orchestration + triggers ─────────────────────────────────────────────────

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
      // Only stamp a successful lastSyncAt when the cycle fully completed; a
      // partial cycle records `sync_incomplete` so the UI can stop claiming success
      // and the next tick retries. Not localized — read via the `ok` flag, never shown raw.
      setStatus({
        syncing: false,
        lastSyncAt: complete ? nowIso() : status.lastSyncAt,
        lastError: complete ? null : 'sync_incomplete',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[sync] failed:', message);
      setStatus({ syncing: false, lastError: message });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Manual trigger (the Settings "Sync now" button). Probes connectivity first so
 * the UI can tell "offline" apart from "nothing to do".
 */
export async function syncNow(): Promise<{ ok: boolean; offline: boolean }> {
  if (!IS_OFFLINE_CAPABLE) return { ok: true, offline: false };
  if (!(await isOnline())) return { ok: false, offline: true };
  await runSync();
  return { ok: status.lastError === null, offline: false };
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
export async function resyncFromScratch(): Promise<{ ok: boolean; offline: boolean }> {
  if (!IS_OFFLINE_CAPABLE) return { ok: true, offline: false };
  if (!(await isOnline())) return { ok: false, offline: true };
  const db = getDb();
  await db.runAsync('DELETE FROM sync_meta WHERE key = ?', [META_LAST_PULLED_AT] as never[]);
  await runSync();
  return { ok: status.lastError === null, offline: false };
}

/**
 * Register the sync triggers (idempotent). Deliberately calm: once at cold start,
 * once when connectivity returns, and every 5 minutes while the app is
 * foregrounded. Local writes land durably in SQLite; the next trigger pushes them.
 */
export async function startSync(cb: () => void): Promise<void> {
  if (!IS_OFFLINE_CAPABLE || started) return;
  started = true;
  subscribeConnectivity((online) => {
    if (online) void runSync();
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void runSync();
  }, 300_000);
  await runSync();
  cb();
}
