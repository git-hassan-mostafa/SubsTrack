import { getDb, initOfflineDb } from "../db/sqlite";
import { pruneWindowedTables } from "../sync";
// Once at app bootstrap, BEFORE any repository read.
export async function initOffline(): Promise<void> {
  await initOfflineDb();
  await pruneWindowedTables(getDb());
}
