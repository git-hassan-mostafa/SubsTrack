import * as SQLite from 'expo-sqlite';
import { IS_OFFLINE_CAPABLE } from '../platform';
import { runMigrations } from './migrations';

const DB_NAME = 'substrack.db';

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Open the local DB and run migrations. Idempotent and safe to call from
 * bootstrap before any repository use. No-op on web (offline is native-only).
 */
export async function initOfflineDb(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;'); // concurrent reads during writes
    await runMigrations(db);
    _db = db;
  })();
  return _initPromise;
}

/** The opened handle. Throws if `initOfflineDb()` hasn't completed. */
export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    throw new Error(
      '[offline] DB not initialized — call initOfflineDb() at app bootstrap before any repository call',
    );
  }
  return _db;
}

export function isOfflineDbReady(): boolean {
  return _db !== null;
}

/** Drop all local data (used on a different-tenant login). Keeps the schema. */
export async function wipeOfflineData(): Promise<void> {
  if (!_db) return;
  const { TABLES } = await import('./tables');
  await _db.withTransactionAsync(async () => {
    for (const t of TABLES) await _db!.execAsync(`DELETE FROM ${t.name};`);
    await _db!.execAsync('DELETE FROM outbox;');
    await _db!.execAsync('DELETE FROM sync_cursors;');
  });
}
