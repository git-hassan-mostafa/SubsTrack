import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { landingPath } from "./access";
import type { FromState } from "./RequireSignedIn";

// A signed-in visitor goes back where they were sent from; RequireAccess re-checks it.
export function GuestOnly() {
  const viewer = useAuth();
  const location = useLocation();
  if (!viewer.user) return <Outlet />;
  const from = (location.state as FromState | null)?.from;
  return <Navigate to={from ?? landingPath(viewer)} replace />;
}
