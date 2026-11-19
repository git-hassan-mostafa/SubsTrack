import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { isSyncOverdue } from "@/src/core/offline";
import { useSyncStatus } from "./useSyncStatus";

// Re-checked on every return to the app: Android keeps it in memory for days.
export function useSyncRequired(): boolean {
  const status = useSyncStatus();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  return isSyncOverdue(status, now);
}
