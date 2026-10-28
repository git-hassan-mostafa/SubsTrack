import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";

export const IS_OTA_CAPABLE =
  Platform.OS !== "web" && Updates.isEnabled && !__DEV__;

// true once a newer bundle is downloaded and waiting for a restart
export async function downloadUpdate(): Promise<boolean> {
  if (!IS_OTA_CAPABLE) return false;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable && !result.isRollBackToEmbedded) return false;
    await Updates.fetchUpdateAsync();
    return true;
  } catch {
    return false;
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
      if (state === "active") void downloadUpdate();
    });
    return () => sub.remove();
  }, []);

  const apply = useCallback(() => {
    Updates.reloadAsync().catch(() => {});
  }, []);

  return { updateReady: IS_OTA_CAPABLE && isUpdatePending, apply };
}
