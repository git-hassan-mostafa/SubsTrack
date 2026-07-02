import type { SQLiteDatabase } from 'expo-sqlite';
import { MIGRATIONS } from './schema';

/**
 * Versioned migration runner keyed on SQLite's `user_version`. Runs each
 * pending block in a transaction, then bumps the version. Adding a column later
 * = append a new array to `MIGRATIONS` with the `ALTER TABLE` statements.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;

  // Fresh install (user_version 0 = no tables yet): SCHEMA_V1 is regenerated from
  // the current TABLES descriptor, so it already contains every table + column
  // that later delta versions add. Apply V1 alone and jump straight to the latest
  // version — running the deltas (e.g. `ALTER TABLE … ADD COLUMN`) on a fresh DB
  // would fail on already-present columns (SQLite has no ADD COLUMN IF NOT EXISTS).
  // Safe ONLY because every delta is purely additive DDL already reflected in V1;
  // a future data-transform migration must not rely on this fast-path.
  if (version === 0) {
    await db.withTransactionAsync(async () => {
      for (const stmt of MIGRATIONS[0]) {
        await db.execAsync(stmt);
      }
    });
    // user_version is an integer we control — safe to interpolate.
    await db.execAsync(`PRAGMA user_version = ${MIGRATIONS.length};`);
    return;
  }

  // Existing install: apply each pending delta version in order.
  for (let v = version; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      for (const stmt of MIGRATIONS[v]) {
        await db.execAsync(stmt);
      }
    });
    version = v + 1;
    await db.execAsync(`PRAGMA user_version = ${version};`);
  }
}
