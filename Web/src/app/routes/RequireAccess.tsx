import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { canOpen, type PageAccess } from "@shared/modules/authentication/auth/utils/pageAccess";
import { landingPath } from "./access";

interface RequireAccessProps {
  access: PageAccess;
  children: ReactNode;
}

export function RequireAccess({ access, children }: RequireAccessProps) {
  const viewer = useAuth();
  if (!canOpen(viewer, access)) {
    return <Navigate to={landingPath(viewer)} replace />;
  }
  return children;
}
