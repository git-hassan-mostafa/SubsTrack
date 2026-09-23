import type { AuthUser, Branch } from "@/src/core/types";
import {
  type BranchFilter,
  BRANCH_FILTER_UNASSIGNED,
} from "@/src/core/constants";
import { useUiPrefStore } from "./uiPrefStore";

/** Can the branch selector still offer this stored filter? See gotcha #157. */
export function isPickableBranchFilter(
  filter: BranchFilter,
  branches: Branch[],
): boolean {
  if (filter === null || filter === BRANCH_FILTER_UNASSIGNED) return true;
  return branches.some((b) => b.id === filter && b.active);
}

/** Drop a branch preference the freshly loaded branch list cannot explain. */
export function reconcileBranchPref(branches: Branch[]): void {
  const store = useUiPrefStore.getState();
  if (isPickableBranchFilter(store.currentBranchId, branches)) return;
  store.setCurrentBranchId(null);
}

/**
 * Resolves the BranchFilter to apply to queries for the calling user.
 *
 *   Branch-scoped user (branchId !== null) — always returns their own branchId.
 *     The header selector is not rendered for them; RLS also enforces this.
 *
 *   Tenant-wide admin (branchId === null) — returns whatever they last picked
 *     in the header selector via uiPrefStore.currentBranchId. Can be:
 *       null                       → "All Branches" (no filter)
 *       BRANCH_FILTER_UNASSIGNED   → only unassigned records
 *       <UUID>                     → that specific branch
 *
 * Use from anywhere that needs to scope a query — stores, services, screens.
 */
export function resolveBranchFilter(user: AuthUser | null): BranchFilter {
  if (!user) return null;
  if (user.branchId !== null) return user.branchId;
  return useUiPrefStore.getState().currentBranchId;
}

/**
 * Client-side counterpart to `applyBranchFilter` for an 'owned'-scope row: does a
 * row with the given `branchId` belong to the set the active filter would return?
 *
 *   null                       → true  (no filter; every row counts)
 *   BRANCH_FILTER_UNASSIGNED   → branchId === null
 *   <UUID>                     → branchId === UUID
 *
 * Use when optimistically adjusting an 'owned' branch-scoped count after a
 * mutation, so the count only moves when the row is part of the active view.
 */
export function ownedRowMatchesFilter(
  branchId: string | null,
  filter: BranchFilter,
): boolean {
  if (filter === null) return true;
  if (filter === BRANCH_FILTER_UNASSIGNED) return branchId === null;
  return branchId === filter;
}
