// Public surface of the offline-first infrastructure. Repositories import the
// pieces they need from here; the rest of the app only touches `initOffline`.

export { IS_OFFLINE_CAPABLE } from './platform';
export { initOffline } from './bootstrap/offlineBootstrap';
export { ensureTenantScope } from './bootstrap/tenant';
export { runSync, syncNow, getSyncStatus, subscribeSyncStatus } from './sync/engine';
export type { SyncStatus } from './sync/engine';
export { pullAll, hasEverSynced } from './sync/pull';
export { RequiresConnectionError } from './errors';
export { newId, nowIso, deterministicId } from './ids';
export { getIsOnline, isOnline } from './net/connectivity';
export { countParked, countPending } from './outbox/outbox';
export { OfflineBaseRepository } from './OfflineBaseRepository';
export { insertDirty, updateDirty, upsertPaymentDirty } from './db/dml';
