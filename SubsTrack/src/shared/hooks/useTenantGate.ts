import { useEffect } from "react";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useSyncStatus } from "./useSyncStatus";

// Sync spots the owner turning the organization off (or back on) first; re-read it then.
export function useTenantGate(): boolean {
  const { tenantInactive } = useSyncStatus();
  const refreshTenantActive = useAuthSlice((s) => s.refreshTenantActive);
  const tenantActive = useAuthSlice((s) => s.tenantActive);

  useEffect(() => {
    void refreshTenantActive();
  }, [tenantInactive, refreshTenantActive]);

  return tenantActive;
}
