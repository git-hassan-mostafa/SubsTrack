import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";

/**
 * OTA updates only exist in a release native build — web has no expo-updates
 * runtime and dev builds load from the Metro server instead.
 */
export const IS_OTA_CAPABLE =
  Platform.OS !== "web" && Updates.isEnabled && !__DEV__;

async function downloadIfAvailable(): Promise<void> {
  try {
    const result = await Updates.checkForUpdateAsync();
    // A rollback directive is also "something to fetch" — that's how
    // `eas update:rollback` reaches devices.
    if (result.isAvailable || result.isRollBackToEmbedded) {
      await Updates.fetchUpdateAsync();
    }
  } catch {
    // Offline or nothing published — the normal case here, so stay silent.
  }
}

/**
 * Tracks whether a newer JS bundle has finished downloading and is waiting to
 * run. `expo-updates` already checks + downloads once per cold start
 * (`checkAutomatically: ON_LOAD`); this adds a re-check on every foreground
 * because staff keep the app open all day and rarely cold-start it.
 */
export function useAppUpdate(): { updateReady: boolean; apply: () => void } {
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (!IS_OTA_CAPABLE) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void downloadIfAvailable();
    });
    return () => sub.remove();
  }, []);

  const apply = useCallback(() => {
    // Nothing to catch meaningfully — on failure the update simply stays
    // pending and runs on the next launch.
    Updates.reloadAsync().catch(() => {});
  }, []);

  return { updateReady: IS_OTA_CAPABLE && isUpdatePending, apply };
}
