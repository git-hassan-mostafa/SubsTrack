import { BranchFilter } from "@/src/core/constants";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useUiPrefStore } from "../lib/uiPrefStore";

/** Hook variant. Re-renders when either auth or uiPref changes. */
export function useEffectiveBranchFilter(): BranchFilter {
  const user = useAuthSlice((s) => s.user);
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  if (!user) return null;
  if (user.branchId !== null) return user.branchId;
  return currentBranchId;
}
