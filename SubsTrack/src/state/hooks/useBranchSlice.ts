import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { BranchSlice } from '@/src/state/slices/branches/branchSlice';

export function useBranchSlice(): BranchSlice;
export function useBranchSlice<T>(selector: (state: BranchSlice) => T): T;
export function useBranchSlice<T = BranchSlice>(selector?: (state: BranchSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.branches;
    return selector ? selector(slice) : (slice as T);
  });
}
