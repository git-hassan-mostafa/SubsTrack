import type { SQLiteDatabase } from 'expo-sqlite';
import { encodeRow } from './codec';

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

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
 * Upsert a payment-style row on its natural key (customer_plan_id, billing_month)
 * and mark it dirty — mirrors the server upsert so re-recording a voided month
 * replaces the row instead of inserting (gotcha #1). Returns the resulting id.
 */
export async function upsertPaymentDirty(
  db: SQLiteDatabase,
  row: object,
): Promise<void> {
  const { columns, values } = encodeRow('payments', row);
  const cols = [...columns, '_dirty'];
  const vals = [...values, 1];
  const updates = cols
    .filter((c) => c !== 'id' && c !== 'customer_plan_id' && c !== 'billing_month' && c !== 'created_at')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  await db.runAsync(
    `INSERT INTO payments (${cols.join(', ')}) VALUES (${placeholders(cols.length)})
     ON CONFLICT (customer_plan_id, billing_month) DO UPDATE SET ${updates}`,
    vals as never[],
  );
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
