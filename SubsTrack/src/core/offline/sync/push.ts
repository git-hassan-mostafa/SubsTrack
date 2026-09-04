import type { SQLiteDatabase } from "expo-sqlite";
import { supabase } from "@/src/shared/lib/supabase";
import { inBatches } from "../batch";
import { decodeRow } from "../db/codec";
import { getDb } from "../db/sqlite";
import { PUSH_WAVES, TABLE_BY_NAME } from "../db/tables";
import { withDbLock } from "../dbLock";
import { mapWithLimit, NETWORK_CONCURRENCY } from "./parallel";

const PUSH_ROWS = 250;

const ID_BATCH = 100;

/**
 * Remove columns the server owns from a push payload:
 *  - `updated_at` is set by a Postgres trigger (and is null for locally-created
 *    plans), so we never send it — the pull reads back the server's value.
 *  - `generated` columns are rejected by Postgres if a value is provided (no
 *    mirrored table has one today — a bill's balance is a view, never a column).
 */
function stripForPush(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...row };
  delete out.updated_at;
  for (const c of TABLE_BY_NAME[table]?.generated ?? []) delete out[c];
  return out;
}

/**
 * The upsert conflict key for ONE row. Tables with a natural-key UNIQUE index
 * converge on that key — the local row may exist on the server under a different
 * id (created on the web or another device), and an id-targeted upsert would
 * insert a duplicate and fail on the index forever. Everything else converges on
 * its primary key. Keep in sync with NATURAL_KEYS in db/dml.ts.
 *
 * `charges` is decided per ROW, not per table: only a month bill carries the
 * natural key. A sale or manual bill leaves both columns NULL, and Postgres
 * treats NULLs as distinct — so ON CONFLICT on that key can never match, and a
 * re-sent row would hit the primary key instead and wedge the whole queue.
 */
function conflictTarget(table: string, row: Record<string, unknown>): string {
  if (table === "charges") {
    return row.customer_plan_id != null && row.billing_month != null
      ? "customer_plan_id,billing_month"
      : "id";
  }
  if (table === "skipped_months") return "customer_plan_id,billing_month";
  if (table === "collection_items") return "collection_id,charge_id";
  if (table === "tenant_settings") return "tenant_id,key";
  return "id";
}

/** Send one table's dirty rows up. Never throws — a failure leaves them dirty. */
async function pushTable(db: SQLiteDatabase, table: string): Promise<void> {
  const spec = TABLE_BY_NAME[table];
  const raw = await withDbLock(() =>
    db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE _dirty = 1`,
    ),
  );
  if (raw.length === 0) return;

  const groups = new Map<string, { id: string; row: Record<string, unknown> }[]>();
  for (const r of raw) {
    const row = stripForPush(table, decodeRow(table, r));
    const entry = { id: r.id as string, row };
    const target = conflictTarget(table, row);
    const group = groups.get(target);
    if (group) group.push(entry);
    else groups.set(target, [entry]);
  }

  for (const [target, group] of groups) {
    for (const chunk of inBatches(group, PUSH_ROWS)) {
      const { error } = await supabase.from(table).upsert(
        chunk.map((c) => c.row),
        { onConflict: target, ignoreDuplicates: spec?.appendOnly === true },
      );
      if (error) {
        console.warn(`[sync] push ${table} failed:`, error.message);
        continue;
      }

      const ids = chunk.map((c) => c.id);
      await withDbLock(() =>
        db.runAsync(
          `UPDATE ${table} SET _dirty = 0 WHERE id IN (${ids.map(() => "?").join(", ")})`,
          ids as never[],
        ),
      );
    }
  }
}

/** Drop the log entries for deletes that reached the server. */
async function clearDeleteLog(
  db: SQLiteDatabase,
  table: string,
  ids: string[],
): Promise<void> {
  await withDbLock(() =>
    db.runAsync(
      `DELETE FROM pending_deletes
        WHERE table_name = ? AND row_id IN (${ids.map(() => "?").join(", ")})`,
      [table, ...ids] as never[],
    ),
  );
}

/**
 * Replay each logged hard delete as a real server delete (server foreign keys
 * cascade to children). One request per BATCH instead of per row — but the
 * tables stay sequential on purpose: two cascading deletes on a parent and its
 * child running at the same time can deadlock in Postgres.
 */
async function pushDeletes(db: SQLiteDatabase): Promise<void> {
  const dels = await withDbLock(() =>
    db.getAllAsync<{ table_name: string; row_id: string }>(
      "SELECT table_name, row_id FROM pending_deletes",
    ),
  );
  const byTable = new Map<string, string[]>();
  for (const d of dels) {
    const queued = byTable.get(d.table_name);
    if (queued) queued.push(d.row_id);
    else byTable.set(d.table_name, [d.row_id]);
  }

  for (const [table, all] of byTable) {
    for (const ids of inBatches(all, ID_BATCH)) {
      const { error } = await supabase.from(table).delete().in("id", ids);
      if (!error) {
        await clearDeleteLog(db, table, ids);
        continue;
      }
      console.warn(`[sync] delete ${table} batch failed:`, error.message);
      for (const id of ids) {
        const { error: rowError } = await supabase
          .from(table)
          .delete()
          .eq("id", id);
        if (rowError) {
          console.warn(`[sync] delete ${table} failed:`, rowError.message);
          continue;
        }
        await clearDeleteLog(db, table, [id]);
      }
    }
  }
}

/**
 * Send everything that changed locally up to Supabase, then replay hard deletes.
 * Tables go up in `PUSH_WAVES` order — one wave in parallel, waves one after
 * another — so the server's foreign keys always see a parent before its child.
 */
export async function pushDirty(): Promise<void> {
  const db = getDb();
  for (const wave of PUSH_WAVES) {
    const tables = wave.filter((t) => TABLE_BY_NAME[t]?.scope === "tenant");
    await mapWithLimit(tables, NETWORK_CONCURRENCY, (t) => pushTable(db, t));
  }
  await pushDeletes(db);
}
