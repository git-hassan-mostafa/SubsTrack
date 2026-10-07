import * as SQLite from "expo-sqlite";
import { applySchema } from "./applySchema";
import { withDbLock } from "../dbLock";

const DB_NAME = "sijil.db";

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<void> | null = null;

// Idempotent; reconciles the schema with `tables.ts` before any repository use.
export async function initOfflineDb(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    await db.execAsync("PRAGMA synchronous = NORMAL;");
    await applySchema(db);
    _db = db;
  })();
  return _initPromise;
}

/** The opened handle. Throws if `initOfflineDb()` hasn't completed. */
export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    throw new Error(
      "[offline] DB not initialized — call initOfflineDb() at app bootstrap before any repository call",
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
  const { TABLES } = await import("./tables");
  await withDbLock(() =>
    _db!.withTransactionAsync(async () => {
      for (const t of TABLES) await _db!.execAsync(`DELETE FROM ${t.name};`);
      await _db!.execAsync("DELETE FROM pending_deletes;");
      await _db!.execAsync(
        "DELETE FROM sync_meta WHERE key IN ('last_pulled_at', 'last_sync_at');",
      );
    }),
  );
}
