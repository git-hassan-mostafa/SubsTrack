// Public surface of the offline-first infrastructure. Repositories import the
// pieces they need from here; the rest of the app only touches `initOffline`.

export { IS_OFFLINE_CAPABLE } from './platform';
export { initOffline } from './bootstrap/offlineBootstrap';
export { ensureTenantScope } from './bootstrap/tenant';
export { runSync, syncNow, getSyncStatus, subscribeSyncStatus } from './sync';
export type { SyncStatus } from './sync';
export { RequiresConnectionError } from './errors';
export { newId, nowIso, deterministicId } from './ids';
export { getIsOnline, isOnline } from './net/connectivity';
export { OfflineBaseRepository } from './OfflineBaseRepository';
export { insertDirty, updateDirty, upsertPaymentDirty, markDeleted } from './db/dml';
