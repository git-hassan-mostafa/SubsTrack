import type { AppUser, Branch, UserRole } from "@shared/core/types";
import type {
  StaffRole,
  UserCreateInput,
  UserUpdateInput,
} from "@shared/modules/admin/users/utils/types";
import { isLongEnoughPassword, isValidUsername } from "@shared/modules/admin/users/utils/userRules";

const STAFF_ROLES: readonly StaffRole[] = ["user", "admin"];
const OWNER_ROLES: readonly UserRole[] = ["superadmin"];

export type UserDraft = {
  username: string;
  fullName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  role: UserRole;
  branchId: string | null;
  changePassword: boolean;
};

export function userDraftOf(user: AppUser | null, newBranchId: string | null): UserDraft {
  return {
    username: user?.username ?? "",
    fullName: user?.fullName ?? "",
    password: "",
    confirmPassword: "",
    phoneNumber: user?.phoneNumber ?? "",
    role: user?.role ?? "user",
    branchId: user ? user.branchId : newBranchId,
    changePassword: false,
  };
}

export function asksPassword(draft: UserDraft, editing: boolean): boolean {
  return !editing || draft.changePassword;
}

export function withChangePassword(draft: UserDraft, changePassword: boolean): UserDraft {
  return { ...draft, changePassword, password: "", confirmPassword: "" };
}

export function isUsernameInvalid(draft: UserDraft): boolean {
  return draft.username.length > 0 && !isValidUsername(draft.username);
}

// Flagged only once the first password is long enough and a confirm is typed.
export function isPasswordMismatch(draft: UserDraft, editing: boolean): boolean {
  return (
    asksPassword(draft, editing) &&
    isLongEnoughPassword(draft.password) &&
    draft.confirmPassword.length > 0 &&
    draft.password !== draft.confirmPassword
  );
}

export function isBranchMissingForStaff(draft: UserDraft, activeBranchCount: number): boolean {
  return activeBranchCount > 0 && draft.role === "user" && draft.branchId === null;
}

// The owner keeps the owner role; anyone else is staff or admin.
export function pickableRoles(draft: UserDraft): readonly UserRole[] {
  return draft.role === "superadmin" ? OWNER_ROLES : STAFF_ROLES;
}

export function isRoleLocked(
  draft: UserDraft,
  editUser: AppUser | null,
  currentUserId: string | undefined,
): boolean {
  return draft.role === "superadmin" || (editUser !== null && editUser.id === currentUserId);
}

// With one active branch, new staff land in it once branches finish loading.
export function seededStaffBranchId(
  draft: UserDraft,
  editing: boolean,
  activeBranches: readonly Pick<Branch, "id">[],
): string | null {
  if (editing || activeBranches.length !== 1) return null;
  if (draft.branchId !== null || draft.role !== "user") return null;
  return activeBranches[0].id;
}

export function canSaveUser(draft: UserDraft, editing: boolean, activeBranchCount: number): boolean {
  const passwordOk =
    !asksPassword(draft, editing) ||
    (isLongEnoughPassword(draft.password) && draft.password === draft.confirmPassword);
  return (
    draft.username.trim().length > 0 &&
    draft.fullName.trim().length > 0 &&
    !isUsernameInvalid(draft) &&
    !isBranchMissingForStaff(draft, activeBranchCount) &&
    passwordOk
  );
}

export function userCreateInput(draft: UserDraft): UserCreateInput {
  return {
    username: draft.username,
    fullName: draft.fullName,
    password: draft.password,
    phone: draft.phoneNumber || null,
    role: draft.role === "user" ? "user" : "admin",
    branchId: draft.branchId,
  };
}

export function userUpdateInput(draft: UserDraft): UserUpdateInput {
  return {
    username: draft.username,
    fullName: draft.fullName,
    phone: draft.phoneNumber || null,
    role: draft.role,
    branchId: draft.branchId,
    newPassword: draft.changePassword ? draft.password : undefined,
  };
}
