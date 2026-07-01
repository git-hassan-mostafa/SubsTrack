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
