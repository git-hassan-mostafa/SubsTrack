import type { BranchFilter } from "@shared/core/constants";
import type { ActiveFilter, PageWindow, UserRole } from "@shared/core/types";

export type StaffRole = "admin" | "user";

export interface UserCreateInput {
  username: string;
  fullName: string;
  password: string;
  phone: string | null;
  role: StaffRole;
  branchId: string | null;
}

// An edit may keep the owner role; only admin or user can be picked.
export interface UserUpdateInput {
  username: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  branchId: string | null;
  newPassword?: string;
}

// "admin" also matches the owner (superadmin): both run the organization.
export type UserRoleFilter = "all" | StaffRole;

export interface UserPageQuery extends PageWindow {
  search: string;
  status: ActiveFilter;
  role: UserRoleFilter;
  branch: BranchFilter;
}
