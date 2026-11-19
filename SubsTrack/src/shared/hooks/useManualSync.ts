import { useState } from "react";
import { useTranslation } from "react-i18next";
import { syncNow } from "@/src/core/offline";
import { refreshActiveData } from "@shared/state/refreshActiveData";

type SyncFailure = "offline" | "failed";

// Stores re-read even on failure: a partial cycle may still have pulled rows.
export function useManualSync() {
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);
  const [failure, setFailure] = useState<SyncFailure | null>(null);

  async function sync() {
    if (syncing) return;
    setFailure(null);
    setSyncing(true);
    try {
      const { ok, offline } = await syncNow();
      setFailure(offline ? "offline" : ok ? null : "failed");
      refreshActiveData();
    } finally {
      setSyncing(false);
    }
  }

  const error = failure
    ? t(failure === "offline" ? "settings.sync_offline" : "settings.sync_failed")
    : null;

  return { syncing, error, clearError: () => setFailure(null), sync };
}
