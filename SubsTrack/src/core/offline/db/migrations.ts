import type { SQLiteDatabase } from 'expo-sqlite';
import { MIGRATIONS } from './schema';

/**
 * Versioned migration runner keyed on SQLite's `user_version`. Runs each
 * pending block in a transaction, then bumps the version. Dev-mode: `MIGRATIONS`
 * currently has one entry (SCHEMA_V1), so this only ever runs once per install —
 * clear app data to pick up a schema change instead of writing a migration.
 * Once this ships to real users, append a new array to `MIGRATIONS` per change.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;

  for (let v = version; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      for (const stmt of MIGRATIONS[v]) {
        await db.execAsync(stmt);
      }
    });
    version = v + 1;
    // user_version is an integer we control — safe to interpolate.
    await db.execAsync(`PRAGMA user_version = ${version};`);
  }
}
