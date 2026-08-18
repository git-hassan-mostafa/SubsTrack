import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { ReportsSlice } from '@/src/state/slices/reports/reportsSlice';

export function useReportsSlice(): ReportsSlice;
export function useReportsSlice<T>(selector: (state: ReportsSlice) => T): T;
export function useReportsSlice<T = ReportsSlice>(selector?: (state: ReportsSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.reports;
    return selector ? selector(slice) : (slice as T);
  });
}
