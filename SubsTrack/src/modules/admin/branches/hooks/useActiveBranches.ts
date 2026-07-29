import { Branch } from "@/src/core/types";
import { useEffect } from "react";
import { useBranchSlice } from "@/src/state/hooks/useBranchSlice";

/**
 * Returns the tenant's active branches, ensuring they've been loaded.
 *
 * Use this when a screen or form needs to react to "does this tenant have
 * any branches?" — for example UserFormSheet enforces "staff users must be
 * assigned to a branch" only when at least one branch exists.
 *
 * Safe to call from several components at once: `getBranches()` short-circuits
 * once a fetch has completed OR while one is in flight, so the duplicate calls
 * a form makes (the form itself plus its `BranchPicker`) cost one query, not two.
 */
export function useActiveBranches(): Branch[] {
  const branches = useBranchSlice((s) => s.items);
  const getBranches = useBranchSlice((s) => s.getBranches);
  useEffect(() => {
    getBranches();
  }, [getBranches]);
  return branches.filter((b) => b.active);
}
