import type { UserRole } from "@/src/core/types";

export const BRANCH_SCOPE_ALL = "__all__";

export type RoleScope = "admin" | "staff";

/** The branch-scope key a session's `branch_id` maps to, matching sync_meta. */
export function scopeKeyOf(branchId: string | null): string {
  return branchId ?? BRANCH_SCOPE_ALL;
}

/** Only admin-vs-staff changes what RLS returns — see gotcha #154. */
export function roleScopeOf(role: UserRole): RoleScope {
  return role === "admin" || role === "superadmin" ? "admin" : "staff";
}
