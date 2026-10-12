import type { UserRole } from "@shared/core/types";

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

export function canManageUser(viewer: UserActor, target: UserActor): boolean {
  return manageBlockKey(viewer, target) === null;
}

// Deactivate / delete: never your own account, and only someone you outrank.
export function manageBlockKey(viewer: UserActor, target: UserActor): string | null {
  if (target.id === viewer.id) return "why_disabled.own_account";
  if (!canEditUser(viewer, target)) return "why_disabled.other_branch";
  if (viewer.role === "superadmin") return null;
  return viewer.role === "admin" && target.role === "user" ? null : "why_disabled.user_rank";
}
