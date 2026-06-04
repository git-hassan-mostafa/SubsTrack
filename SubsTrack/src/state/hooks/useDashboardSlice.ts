import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { DashboardSlice } from '@/src/state/slices/dashboard/dashboardSlice';

export function useDashboardSlice(): DashboardSlice;
export function useDashboardSlice<T>(selector: (state: DashboardSlice) => T): T;
export function useDashboardSlice<T = DashboardSlice>(
  selector?: (state: DashboardSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.dashboard;
    return selector ? selector(slice) : (slice as T);
  });
}
