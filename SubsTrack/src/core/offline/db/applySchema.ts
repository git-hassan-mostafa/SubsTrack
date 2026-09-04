import type { SQLiteDatabase } from 'expo-sqlite';
import { CREATE_INDEX_STATEMENTS, CREATE_TABLE_STATEMENTS, columnDefs } from './schema';
import { TABLES, type TableSpec } from './tables';

/**
 * Reconcile the local mirror with `TABLES` — no version numbers, no migration
 * list. Creates missing tables, adds missing columns, creates missing indices,
 * so editing `tables.ts` is the whole schema change for fresh AND existing
 * installs. Every statement is a no-op when the object already exists, so this
 * runs on every app start.
 *
 * ADDITIVE ONLY: dropped/renamed columns, type changes and new table-level
 * constraints are NOT reconciled (SQLite can't ALTER them). Those need a mirror
 * rebuild — see docs/offline.md.
 */
export async function applySchema(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const stmt of CREATE_TABLE_STATEMENTS) await db.execAsync(stmt);
    for (const t of TABLES) await addMissingColumns(db, t);
    for (const stmt of CREATE_INDEX_STATEMENTS) await db.execAsync(stmt);
  });
}

/** SQLite has no `ADD COLUMN IF NOT EXISTS` — diff the spec against the real table. */
async function addMissingColumns(db: SQLiteDatabase, t: TableSpec): Promise<void> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t.name});`);
  const existing = new Set(rows.map((r) => r.name));
  for (const [name, def] of columnDefs(t)) {
    if (name === 'id' || existing.has(name)) continue;
    await db.execAsync(`ALTER TABLE ${t.name} ADD COLUMN ${def};`);
  }
}
