// The whole offline sync engine, kept intentionally small.
//
//   push  → send every locally-changed row (and hard deletes) up to Supabase
//   pull  → bring rows the server changed since our last pull down to SQLite
//   rule  → on conflict the latest `updated_at` wins
//
// There is no outbox, no per-table cursor, no tombstone table. A row that
// changed locally carries a `_dirty = 1` flag (set by the dml write helpers);
// a hard-deleted row is logged in `pending_deletes`; the last pull position is
// one `last_pulled_at` value in `sync_meta`. That is the entire bookkeeping.
//
// A cycle is NETWORK-PARALLEL and DB-SEQUENTIAL: the pull fetches every table at
// once and the push goes up in dependency waves, while every SQLite write queues
// behind `withDbLock` (one connection — see parallel.ts). Read docs/offline.md.

export {
  flushPendingWrites,
  resyncFromScratch,
  runSync,
  runSyncIfDue,
  startSync,
  syncNow,
} from "./engine";
export {
  getMeta,
  META_ACTIVE_BRANCH_SCOPE,
  META_ACTIVE_TENANT,
  setMeta,
} from "./meta";
export { pruneWindowedTables } from "./pull";
export { getSyncStatus, subscribeSyncStatus } from "./status";
export type { SyncStatus } from "./status";
