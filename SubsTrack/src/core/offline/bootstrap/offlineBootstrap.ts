import { IS_OFFLINE_CAPABLE } from '../platform';
import { initOfflineDb } from '../db/sqlite';
import { startSyncEngine } from '../sync/engine';

/**
 * Open the local DB (+ run migrations) and start the sync engine. Call once at
 * app bootstrap, BEFORE any repository read. No-op on web (offline is native-only).
 */
export async function initOffline(): Promise<void> {
  if (!IS_OFFLINE_CAPABLE) return;
  await initOfflineDb();
  startSyncEngine();
}
