import { useSyncExternalStore } from 'react';
import {
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from '@/src/core/offline';

/**
 * Subscribe to the offline sync engine's status (syncing / lastSyncAt / lastError).
 * Re-renders the caller whenever the status changes. On web (offline-incapable)
 * the status simply stays idle.
 */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}
