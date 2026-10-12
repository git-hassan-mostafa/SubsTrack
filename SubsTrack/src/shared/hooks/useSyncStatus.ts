import { useSyncExternalStore } from "react";
import {
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/src/core/offline";

// On web (offline-incapable) the status simply stays idle.
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatus,
    getSyncStatus,
  );
}
