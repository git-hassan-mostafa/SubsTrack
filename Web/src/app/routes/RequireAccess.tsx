import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { canOpen, landingPath, type RouteAccess } from "./access";

interface RequireAccessProps {
  access: RouteAccess;
  children: ReactNode;
}

export function RequireAccess({ access, children }: RequireAccessProps) {
  const viewer = useAuth();
  if (!canOpen(viewer, access)) {
    return <Navigate to={landingPath(viewer)} replace />;
  }
  return children;
}
