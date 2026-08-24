// PULL: Supabase → local (last-write-wins).
//
// Every table is fetched CONCURRENTLY. Order is irrelevant here — the mirror
// declares no foreign keys (`PRAGMA foreign_keys` stays off, see db/schema.ts)
// and each table reads and writes only itself — so the only thing that must stay
// sequential is the SQLite side, which `withDbLock` handles.

import type { SQLiteDatabase } from "expo-sqlite";
import { supabase } from "@/src/shared/lib/supabase";
import { inBatches } from "../batch";
import {
  clearNaturalKeyDuplicates,
  dirtyIdSet,
  upsertManyFromServer,
} from "../db/dml";
import { getDb } from "../db/sqlite";
import { SYNC_TABLES, TABLE_BY_NAME, TABLES } from "../db/tables";
import { withDbLock } from "../dbLock";
import { isoDaysAgo } from "../ids";
import { getMeta, META_LAST_PULLED_AT, setMeta } from "./meta";
import { mapWithLimit, NETWORK_CONCURRENCY } from "./parallel";

const PAGE = 1000; // PostgREST default cap; page through anything larger
const ID_BATCH = 200; // ids per local DELETE statement

type ServerRow = Record<string, unknown>;

/** One table's outcome: whether it completed, and the newest `updated_at` it saw. */
interface TableResult {
  ok: boolean;
  max: string | null;
}

/**
 * Merge one fetched page into the mirror. Runs under the DB lock, so it owns the
 * connection for its transaction. The two lookups are batched per page rather
 * than done per row: every SQLite call is a bridge round trip, and a page is a
 * thousand rows.
 */
async function mergePage(
  db: SQLiteDatabase,
  table: string,
  rows: ServerRow[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    // A row with an un-pushed local edit wins until it's pushed — skip it.
    const dirty = await dirtyIdSet(
      db,
      table,
      rows.map((r) => r.id as string),
    );
    let merge =
      dirty.size === 0 ? rows : rows.filter((r) => !dirty.has(r.id as string));
    if (merge.length === 0) return;

    // Payments & co. also carry a natural-key UNIQUE index — a local row holding
    // an incoming row's (line, month) under another id has to go first.
    const skip = await clearNaturalKeyDuplicates(db, table, merge);
    if (skip.size > 0) merge = merge.filter((r) => !skip.has(r.id as string));
    if (merge.length > 0) await upsertManyFromServer(db, table, merge);
  });
}

/** Bring one table up to date. Never throws — a failure reports `ok: false`. */
async function pullTable(
  db: SQLiteDatabase,
  table: string,
  startedAt: string | null,
): Promise<TableResult> {
  const spec = TABLE_BY_NAME[table];
  // Windowed tables (audit_logs) keep only the last N days locally.
  const windowStart = spec?.pullDays ? isoDaysAgo(spec.pullDays) : null;
  let max: string | null = null;

  try {
    // Offset-page over a STABLE predicate (`updated_at > startedAt`), ordered by
    // (updated_at, id). Keyset paging on updated_at alone would silently drop
    // rows whenever more than PAGE rows share a single timestamp — which the
    // migration backfill (every existing row stamped with one transaction NOW())
    // and any bulk insert guarantee. `id` is the deterministic tiebreaker.
    for (let offset = 0; ; offset += PAGE) {
      let q = supabase
        .from(table)
        .select("*")
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (startedAt) q = q.gt("updated_at", startedAt);
      if (windowStart) q = q.gte("occurred_at", windowStart);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as ServerRow[];
      if (rows.length === 0) break;

      await withDbLock(() => mergePage(db, table, rows));

      const pageMax = rows[rows.length - 1].updated_at as string;
      if (!max || pageMax > max) max = pageMax; // ISO8601 strings sort chronologically
      if (rows.length < PAGE) break;
    }
    return { ok: true, max };
  } catch (e) {
    // Request error or a merge failure — skip this table this cycle and keep the
    // cursor pinned (see `complete` below). Retried on the next cycle.
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[sync] pull ${table} failed:`, message);
    return { ok: false, max: null };
  }
}

/**
 * Pull rows the server changed since our last pull and merge them into the
 * mirror. "Latest updated_at wins": we only fetch rows newer than `last_pulled_at`
 * and we never overwrite a row that still has an un-pushed local edit. Then
 * reconcile hard deletes for the low-volume tables. Returns `true` only when the
 * whole cycle (every table + delete reconcile) succeeded.
 */
export async function pullChanges(): Promise<boolean> {
  const db = getDb();
  const startedAt = await getMeta(db, META_LAST_PULLED_AT); // null on the very first sync
  const tables = SYNC_TABLES.filter((t) => !TABLE_BY_NAME[t]?.pushOnly); // exception_logs: pushed up, never pulled down
  const results = await mapWithLimit(tables, NETWORK_CONCURRENCY, (t) =>
    pullTable(db, t, startedAt),
  );

  // The cursor is shared by every table, so it must only ever move forward once
  // EVERY table has been pulled up to that point. If a single table failed this
  // cycle we hold the cursor back — otherwise a newer row from a table that DID
  // succeed would push the cursor past the failed table's un-pulled rows, and
  // `updated_at > cursor` would hide them from every future pull forever. A
  // partial cycle leaves the old cursor in place; the next cycle re-pulls from
  // the same point (upserts are idempotent) and can still reach the stranded rows.
  let complete = true;
  let newMax = startedAt;
  for (const r of results) {
    if (!r.ok) complete = false;
    else if (r.max && (!newMax || r.max > newMax)) newMax = r.max;
  }
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
const DELETE_RECONCILE_TABLES = [
  "customers",
  "plans",
  "branches",
  "currencies",
  "products",
  "services",
];

/** Every id the server still holds for a table (paged). `null` = the fetch failed. */
async function fetchServerIds(table: string): Promise<Set<string> | null> {
  // An unpaged select is capped at PAGE rows by PostgREST, so for a table with
  // more than PAGE rows every id past the cap would look "missing" and its local
  // row would be wrongly deleted. `order('id')` is just as load-bearing: offset
  // paging without a total order lets Postgres return the pages in any order, so
  // rows can repeat and others never appear — and a row missing from the id list
  // is deleted locally. Both are the same bug (a live row wiped off the device).
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn(`[sync] delete-reconcile ${table} failed:`, error.message);
      return null;
    }
    const rows = (data ?? []) as { id: string }[];
    for (const r of rows) ids.add(r.id);
    if (rows.length < PAGE) break;
  }
  return ids;
}

/** Reconcile one table. Never throws — a failed fetch reports `false`. */
async function reconcileTable(
  db: SQLiteDatabase,
  table: string,
): Promise<boolean> {
  const remote = await fetchServerIds(table);
  if (!remote) return false;

  return withDbLock(async () => {
    // Only already-synced rows, so an un-pushed local create is never mistaken
    // for a remote delete.
    const local = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM ${table} WHERE _dirty = 0`,
    );
    // Never mass-delete on an empty server list: an empty result is ambiguous —
    // "every row really was deleted" vs. "nothing is visible" (the session is gone,
    // or RLS returned nothing). Deleting here would wipe the whole local table;
    // skipping only risks a little staleness, and it reconciles once ≥1 row shows.
    if (remote.size === 0 && local.length > 0) return true;

    const gone = local.map((r) => r.id).filter((id) => !remote.has(id));
    for (const ids of inBatches(gone, ID_BATCH)) {
      await db.runAsync(
        `DELETE FROM ${table} WHERE _dirty = 0 AND id IN (${ids.map(() => "?").join(", ")})`,
        ids as never[],
      );
    }
    return true;
  });
}

/**
 * Drop local rows that no longer exist on the server (a delete done elsewhere).
 * The tables are independent — each only compares its own id list — so they run
 * concurrently. Returns `false` if any table's id list could not be fetched (so
 * the cycle is reported incomplete rather than silently partial).
 */
async function reconcileDeletes(db: SQLiteDatabase): Promise<boolean> {
  const results = await mapWithLimit(
    DELETE_RECONCILE_TABLES,
    NETWORK_CONCURRENCY,
    (t) => reconcileTable(db, t),
  );
  return results.every((ok) => ok);
}

/**
 * Drop local rows that fell out of a windowed table's range (`TableSpec.pullDays`
 * — currently only audit_logs' 30 days). The server keeps the full history; the
 * app fetches older entries online on demand.
 *
 * The `_dirty = 0` guard is mandatory: a row that has not been pushed yet is the
 * ONLY copy in existence, so age must never delete it. Exported and also called
 * at bootstrap, so a device that stays offline for months still prunes.
 */
export async function pruneWindowedTables(db: SQLiteDatabase): Promise<void> {
  for (const t of TABLES) {
    if (!t.pullDays) continue;
    await db.runAsync(
      `DELETE FROM ${t.name} WHERE occurred_at < ? AND _dirty = 0`,
      [isoDaysAgo(t.pullDays)] as never[],
    );
  }
}
