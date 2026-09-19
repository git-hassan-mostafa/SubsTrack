import type { UserRole } from "@/src/core/types";

/** Role alone cannot tell a branch admin from a tenant-wide one — see custody.ts. */
export interface UserActor {
  id: string;
  role: UserRole;
  branchId: string | null;
}

/** Mirrors the users_update RLS clause: a branch viewer writes only its own branch. */
export function canEditUser(viewer: UserActor, target: UserActor): boolean {
  return viewer.branchId === null || target.branchId === viewer.branchId;
}

/** Deactivate / delete: never your own account, and only someone you outrank. */
export function canManageUser(viewer: UserActor, target: UserActor): boolean {
  if (target.id === viewer.id) return false;
  if (!canEditUser(viewer, target)) return false;
  if (viewer.role === "superadmin") return true;
  return viewer.role === "admin" && target.role === "user";
}
