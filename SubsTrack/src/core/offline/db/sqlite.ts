import * as SQLite from 'expo-sqlite';
import { IS_OFFLINE_CAPABLE } from '../platform';
import { applySchema } from './applySchema';

const DB_NAME = 'substrack.db';

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Open the local DB and reconcile its schema with `tables.ts`. Idempotent and
 * safe to call from bootstrap before any repository use. No-op on web (offline
 * is native-only).
 */
export async function initOfflineDb(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;'); // concurrent reads during writes
    await applySchema(db);
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
    await _db!.execAsync('DELETE FROM pending_deletes;');
    // Forget the pull position AND the last-sync stamp, so the next sync re-pulls
    // the new tenant in full instead of the 24h gate calling the wipe "fresh".
    await _db!.execAsync("DELETE FROM sync_meta WHERE key IN ('last_pulled_at', 'last_sync_at');");
  });
}
