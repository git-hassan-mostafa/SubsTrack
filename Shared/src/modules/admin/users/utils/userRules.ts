import type { UserRole } from "@shared/core/types";
import type { UserRoleFilter } from "@shared/modules/admin/users/utils/types";

export const MIN_PASSWORD_LENGTH = 8;

const USERNAME_PATTERN = /^[a-z0-9._]+$/i;

// The create-tenant edge function keeps its own copy: Deno cannot import Shared.
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username.trim());
}

export function isLongEnoughPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function rolesForFilter(filter: UserRoleFilter): UserRole[] | null {
  if (filter === "all") return null;
  return filter === "admin" ? ["admin", "superadmin"] : ["user"];
}

const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  superadmin: "users.super",
  admin: "users.admin",
  user: "users.staff",
};

export function roleLabelKey(role: UserRole): string {
  return ROLE_LABEL_KEYS[role];
}
