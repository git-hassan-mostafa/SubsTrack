import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * WEB STUB — offline-first is native-only.
 *
 * This file exists purely so Metro's WEB bundle never follows the value import
 * `import * as SQLite from 'expo-sqlite'` in the native `sqlite.ts`. On web that
 * package pulls in a `wa-sqlite.wasm` asset that isn't shipped, which crashes the
 * build. Metro resolves `.web.ts` before `.ts`, so web gets this stub and native
 * gets the real `sqlite.ts`.
 *
 * None of these run on web: `IS_OFFLINE_CAPABLE` is false, so `initOfflineDb()`
 * is never called from bootstrap and no repository ever reaches `getDb()` (the
 * platform switch picks the Supabase sibling). They only need to EXIST so the
 * module resolves. Keep this surface in lockstep with `sqlite.ts`.
 */

export async function initOfflineDb(): Promise<void> {
  // no-op: the local DB is never opened on web
}

export function getDb(): SQLiteDatabase {
  throw new Error('[offline] getDb() is not available on web');
}

export function isOfflineDbReady(): boolean {
  return false;
}

export async function wipeOfflineData(): Promise<void> {
  // no-op: there is no local data on web
}
