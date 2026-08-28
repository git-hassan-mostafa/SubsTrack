import type { SQLiteDatabase } from 'expo-sqlite';
import { encodeRow, encodeRowsUniform } from './codec';
import { inBatches } from '../batch';
import { newId } from '../ids';

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

/**
 * Rows per batched statement. Every SQLite call crosses the JS↔native bridge, so
 * the pull merges a 1000-row page in a handful of statements instead of a few
 * thousand. Small enough that rows × columns stays far under SQLite's bound-
 * parameter limit even for the widest table.
 */
const BATCH_ROWS = 200;

/**
 * Tables that converge on a natural key ON TOP OF their id — the mirror's only
 * UNIQUE constraints besides the primary keys. A row can collide on either one,
 * and a SQLite UPSERT resolves only the single target it names (gotcha #49), so
 * both writers below check the key themselves.
 */
const NATURAL_KEYS: Record<string, string[]> = {
  // A month bill: two devices collecting the same month must converge on ONE
  // row, or the same month would be billed twice.
  charges: ['customer_plan_id', 'billing_month'],
  skipped_months: ['customer_plan_id', 'billing_month'],
  tenant_settings: ['tenant_id', 'key'],
  // One line per (hand-over, bill), so replaying a collection is idempotent.
  collection_items: ['collection_id', 'charge_id'],
};

/** INSERT a fully-formed local row (id + timestamps already set) and mark it dirty. */
export async function insertDirty(
  db: SQLiteDatabase,
  table: string,
  row: object,
): Promise<void> {
  const { columns, values } = encodeRow(table, row);
  const cols = [...columns, '_dirty'];
  const vals = [...values, 1];
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols.length)})`,
    vals as never[],
  );
}

/** UPDATE only the given columns of a local row by id and mark it dirty. */
export async function updateDirty(
  db: SQLiteDatabase,
  table: string,
  id: string,
  partial: object,
): Promise<void> {
  const { columns, values } = encodeRow(table, partial);
  if (columns.length === 0) return;
  const set = [...columns.map((c) => `${c} = ?`), '_dirty = 1'].join(', ');
  await db.runAsync(`UPDATE ${table} SET ${set} WHERE id = ?`, [...values, id] as never[]);
}

/**
 * Write a row on its `NATURAL_KEYS` key and mark it dirty — mirrors the server
 * upsert so re-recording a voided month (or re-skipping one) replaces the row
 * instead of inserting (gotcha #1). Identity + key columns + created_at are never
 * overwritten. Returns the id ACTUALLY stored, which is not always `row.id`: an
 * existing row keeps its own id (it may have been created on the web or another
 * device), and an id already taken by an unrelated row falls back to a fresh one.
 * Resolved with a lookup rather than `ON CONFLICT (natural key)` because that only
 * ever heals ONE of the table's two UNIQUE constraints (gotcha #49).
 */
export async function upsertNaturalKeyDirty(
  db: SQLiteDatabase,
  table: string,
  row: object,
): Promise<string> {
  const key = NATURAL_KEYS[table];
  if (!key) throw new Error(`upsertNaturalKeyDirty: ${table} has no natural key`);
  const keep = ['id', ...key, 'created_at'];
  const r = row as Record<string, unknown>;
  const where = key.map((c) => `${c} = ?`).join(' AND ');
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${where}`,
    key.map((c) => r[c]) as never[],
  );
  if (existing) {
    const patch = Object.fromEntries(Object.entries(r).filter(([c]) => !keep.includes(c)));
    await updateDirty(db, table, existing.id, patch);
    return existing.id;
  }
  const taken = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ?`,
    [r.id as string] as never[],
  );
  const id = taken ? newId() : (r.id as string);
  await insertDirty(db, table, { ...r, id });
  return id;
}

/**
 * The natural key of a row as one comparable string, for matching in JS. The
 * separator is a NUL so it can never appear inside a value and merge two keys.
 */
function naturalKeyOf(key: string[], row: Record<string, unknown>): string {
  return key.map((c) => String(row[c])).join('\u0000');
}

/**
 * Which of `ids` still hold an un-pushed local edit — one query per batch instead
 * of a SELECT per row. Such a row wins over the server's copy until it's pushed.
 */
export async function dirtyIdSet(
  db: SQLiteDatabase,
  table: string,
  ids: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const batch of inBatches(ids, BATCH_ROWS)) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM ${table} WHERE _dirty = 1 AND id IN (${placeholders(batch.length)})`,
      batch as never[],
    );
    for (const r of rows) out.add(r.id);
  }
  return out;
}

/**
 * Clear the way for a whole pulled page on a `NATURAL_KEYS` table: a local row
 * holding an incoming row's key under a DIFFERENT id makes the merge fail on that
 * UNIQUE index — which would stall the table's whole pull, every cycle. The server
 * is the authority, so a clean duplicate is dropped; one that still has an
 * un-pushed local edit wins instead and its incoming row is SKIPPED, letting the
 * next push converge the two ids (the server upsert targets the same natural key).
 * Returns the incoming ids to skip — always empty for a table with no natural key.
 */
export async function clearNaturalKeyDuplicates(
  db: SQLiteDatabase,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<Set<string>> {
  const skip = new Set<string>();
  const key = NATURAL_KEYS[table];
  if (!key) return skip;

  const cols = key.join(', ');
  const tuple = `(${placeholders(key.length)})`;
  const stale: string[] = [];
  for (const batch of inBatches(rows, BATCH_ROWS)) {
    // Row-value IN — SQLite answers it straight from the natural-key UNIQUE index.
    // Every natural-key column is TEXT, so the server's raw value binds as-is.
    const dups = await db.getAllAsync<Record<string, unknown>>(
      `SELECT id, _dirty, ${cols} FROM ${table}
       WHERE (${cols}) IN (VALUES ${batch.map(() => tuple).join(', ')})`,
      batch.flatMap((r) => key.map((c) => r[c])) as never[],
    );
    const byKey = new Map(dups.map((d) => [naturalKeyOf(key, d), d]));
    for (const row of batch) {
      const dup = byKey.get(naturalKeyOf(key, row));
      if (!dup || dup.id === row.id) continue;
      if (dup._dirty === 1) skip.add(row.id as string);
      else stale.push(dup.id as string);
    }
  }
  for (const batch of inBatches(stale, BATCH_ROWS)) {
    await db.runAsync(
      `DELETE FROM ${table} WHERE id IN (${placeholders(batch.length)})`,
      batch as never[],
    );
  }
  return skip;
}

/**
 * Merge ONE server row into the local mirror, marked clean (`_dirty = 0`) so the
 * next push won't re-send it. Used by the read-through caches (auth, tenant);
 * the sync engine pulls pages, so it uses `upsertManyFromServer` below.
 */
export async function upsertFromServer(
  db: SQLiteDatabase,
  table: string,
  row: object,
): Promise<void> {
  const { columns, values } = encodeRow(table, row);
  const cols = [...columns, '_dirty'];
  const vals = [...values, 0];
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols.length)})
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    vals as never[],
  );
}

/**
 * The pull's hot path: merge a whole page of server rows with ONE statement per
 * batch instead of one per row. Same rules as `upsertFromServer`. Callers must
 * already have dropped the rows to skip (`dirtyIdSet`, `clearNaturalKeyDuplicates`)
 * — a single row that still collides fails its whole batch, which leaves the table
 * un-merged and retried next cycle rather than silently half-applied.
 */
export async function upsertManyFromServer(
  db: SQLiteDatabase,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  for (const batch of inBatches(rows, BATCH_ROWS)) {
    const { columns, values } = encodeRowsUniform(table, batch);
    const cols = [...columns, '_dirty'];
    const updates = cols
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');
    const tuple = `(${placeholders(cols.length)})`;
    await db.runAsync(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${batch.map(() => tuple).join(', ')}
       ON CONFLICT (id) DO UPDATE SET ${updates}`,
      values.flatMap((v) => [...v, 0]) as never[],
    );
  }
}

/**
 * Record a HARD delete so the next push removes the row from Supabase too.
 * A physically-deleted local row leaves no `_dirty` flag to push, so we log its
 * (table, id) here; `pushDirty()` sends the delete then clears this entry.
 */
export async function markDeleted(
  db: SQLiteDatabase,
  table: string,
  id: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO pending_deletes (table_name, row_id) VALUES (?, ?)`,
    [table, id] as never[],
  );
}
