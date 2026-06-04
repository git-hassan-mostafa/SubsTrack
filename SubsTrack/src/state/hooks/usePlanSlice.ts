import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { PlanSlice } from '@/src/state/slices/plans/planSlice';

export function usePlanSlice(): PlanSlice;
export function usePlanSlice<T>(selector: (state: PlanSlice) => T): T;
export function usePlanSlice<T = PlanSlice>(selector?: (state: PlanSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.plans;
    return selector ? selector(slice) : (slice as T);
  });
}
