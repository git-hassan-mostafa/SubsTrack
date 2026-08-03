import type { SQLiteDatabase } from 'expo-sqlite';
import { encodeRow } from './codec';
import { newId } from '../ids';

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

/**
 * Tables that converge on a natural key ON TOP OF their id — the mirror's only
 * UNIQUE constraints besides the primary keys. A row can collide on either one,
 * and a SQLite UPSERT resolves only the single target it names (gotcha #49), so
 * both writers below check the key themselves.
 */
const NATURAL_KEYS: Record<string, string[]> = {
  payments: ['customer_plan_id', 'billing_month'],
  skipped_months: ['customer_plan_id', 'billing_month'],
  tenant_settings: ['tenant_id', 'key'],
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
 * Clear the way for a pulled row on a `NATURAL_KEYS` table: a local row holding
 * this server row's key under a DIFFERENT id makes the merge fail on that UNIQUE
 * index — which would stall the table's whole pull, every cycle. The server is the
 * authority, so the stale duplicate is dropped; if it still has an un-pushed local
 * edit we skip the server row instead and let the next push converge the two ids
 * (the server upsert targets the same natural key). Returns false = skip this row.
 */
export async function clearNaturalKeyDuplicate(
  db: SQLiteDatabase,
  table: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  const key = NATURAL_KEYS[table];
  if (!key) return true;
  const where = key.map((c) => `${c} = ?`).join(' AND ');
  const dup = await db.getFirstAsync<{ id: string; _dirty: number }>(
    `SELECT id, _dirty FROM ${table} WHERE ${where} AND id <> ?`,
    [...key.map((c) => row[c]), row.id] as never[],
  );
  if (!dup) return true;
  if (dup._dirty === 1) return false;
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, [dup.id] as never[]);
  return true;
}

/**
 * Merge a server row into the local mirror during pull. Marks it clean
 * (`_dirty = 0`) so the next push won't re-send it. Used by the sync engine.
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
