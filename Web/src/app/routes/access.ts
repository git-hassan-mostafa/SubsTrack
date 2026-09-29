export interface RouteAccess {
  role?: "admin" | "tenantWideAdmin";
  whatsapp?: boolean;
}

export interface Viewer {
  isAdmin: boolean;
  isTenantWideAdmin: boolean;
  whatsappEnabled: boolean;
}

// Same role rules as the phone routes; `useAuth()` returns a Viewer as-is.
export function canOpen(viewer: Viewer, access: RouteAccess): boolean {
  if (access.whatsapp && !viewer.whatsappEnabled) return false;
  if (access.role === "admin") return viewer.isAdmin;
  if (access.role === "tenantWideAdmin") return viewer.isTenantWideAdmin;
  return true;
}

export function landingPath(viewer: Viewer): string {
  return viewer.isAdmin ? "/dashboard" : "/customers";
}
