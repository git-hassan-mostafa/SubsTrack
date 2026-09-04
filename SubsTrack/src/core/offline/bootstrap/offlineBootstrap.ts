import { IS_OFFLINE_CAPABLE } from '../platform';
import { getDb, initOfflineDb } from '../db/sqlite';
import { pruneWindowedTables } from '../sync';
/**
 * Open the local DB (+ reconcile its schema) and start the sync triggers. Call once at
 * app bootstrap, BEFORE any repository read. No-op on web (offline is native-only).
 */
export async function initOffline(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  await initOfflineDb();
  await pruneWindowedTables(getDb());
}
