import { Navigate } from "react-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { landingPath } from "./access";

export function LandingRedirect() {
  const viewer = useAuth();
  return <Navigate to={landingPath(viewer)} replace />;
}
