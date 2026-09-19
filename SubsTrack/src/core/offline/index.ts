export { IS_OFFLINE_CAPABLE } from "./platform";
export { initOffline } from "./bootstrap/offlineBootstrap";
export { ensureTenantScope } from "./bootstrap/tenant";
export {
  runSync,
  runSyncIfDue,
  syncNow,
  resyncFromScratch,
  getSyncStatus,
  subscribeSyncStatus,
  suspendSync,
  resumeSync,
} from "./sync";
export type { SyncStatus } from "./sync";
export {
  RequiresConnectionError,
  OrganizationSwitchBlockedError,
} from "./errors";
export { newId, nowIso, deterministicId } from "./ids";
export { getIsOnline, isOnline } from "./net/connectivity";
export { OfflineBaseRepository } from "./OfflineBaseRepository";
export {
  insertDirty,
  updateDirty,
  upsertNaturalKeyDirty,
  markDeleted,
} from "./db/dml";
export { getDb, isOfflineDbReady } from "./db/sqlite";
export { TABLES, TABLE_BY_NAME } from "./db/tables";
export type { TableSpec } from "./db/tables";
export { countUnsyncedWrites, writeBackup } from "./backup/dump";
export { restoreBackup, RestoreBlockedError } from "./backup/restore";
export { validateBackup, scopeKeyOf } from "./backup/validate";
export { BACKUP_TABLE_ORDER } from "./backup/tableOrder";
export type {
  BackupCheck,
  BackupProblem,
  BackupSession,
  BackupWarning,
  LocalBackup,
  RestoreOptions,
} from "./backup/types";
