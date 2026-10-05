import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useIsMultiBranchActive } from "./useIsMultiBranchActive";

// A branch-bound user's branch is fixed (RLS pins it), so only tenant-wide users choose.
export function useCanPickBranch(): boolean {
  const tenantWide = useAuthSlice((s) => s.user !== null && s.user.branchId === null);
  const multiBranch = useIsMultiBranchActive();
  return tenantWide && multiBranch;
}
