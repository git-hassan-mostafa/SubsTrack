import { Navigate, Outlet, useLocation } from "react-router";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { TenantInactivePage } from "@/modules/auth/TenantInactivePage";

export interface FromState {
  from?: string;
}

export function RequireSignedIn() {
  const user = useAuthSlice((s) => s.user);
  const tenantActive = useAuthSlice((s) => s.tenantActive);
  const location = useLocation();

  if (!user) {
    const state: FromState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  if (!tenantActive) return <TenantInactivePage />;
  return <Outlet />;
}
