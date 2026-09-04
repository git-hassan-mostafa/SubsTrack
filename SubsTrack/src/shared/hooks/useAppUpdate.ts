import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";

export const IS_OTA_CAPABLE =
  Platform.OS !== "web" && Updates.isEnabled && !__DEV__;

async function downloadIfAvailable(): Promise<void> {
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable || result.isRollBackToEmbedded) {
      await Updates.fetchUpdateAsync();
    }
  } catch {
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
    Updates.reloadAsync().catch(() => {});
  }, []);

  return { updateReady: IS_OTA_CAPABLE && isUpdatePending, apply };
}
