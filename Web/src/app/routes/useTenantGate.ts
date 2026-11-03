import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useOnTabVisible } from "@/shared/hooks/useOnTabVisible";

export function useTenantGate(): boolean {
  const refreshTenantActive = useAuthSlice((s) => s.refreshTenantActive);
  useOnTabVisible(refreshTenantActive);
  return useAuthSlice((s) => s.tenantActive);
}
