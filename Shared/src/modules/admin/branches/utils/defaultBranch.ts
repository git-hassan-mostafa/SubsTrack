import { BRANCH_FILTER_UNASSIGNED, type BranchFilter } from "@shared/core/constants";
import type { AuthUser, Branch } from "@shared/core/types";

// A new record's branch: the user's own, else the only active one, else none.
export function defaultNewBranchId(
  user: Pick<AuthUser, "branchId"> | null,
  activeBranches: readonly Pick<Branch, "id">[],
): string | null {
  if (user?.branchId) return user.branchId;
  if (activeBranches.length === 1) return activeBranches[0].id;
  return null;
}

// A new customer falls back to the branch the user is looking at, never "unassigned".
export function newCustomerBranchId(
  user: Pick<AuthUser, "branchId"> | null,
  activeBranches: readonly Pick<Branch, "id">[],
  currentBranchId: BranchFilter,
): string | null {
  return (
    defaultNewBranchId(user, activeBranches) ??
    (currentBranchId === BRANCH_FILTER_UNASSIGNED ? null : currentBranchId)
  );
}
