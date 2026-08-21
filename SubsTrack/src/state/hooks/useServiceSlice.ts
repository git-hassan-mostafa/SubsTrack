import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { ServiceSlice } from '@/src/state/slices/services/serviceSlice';

export function useServiceSlice(): ServiceSlice;
export function useServiceSlice<T>(selector: (state: ServiceSlice) => T): T;
export function useServiceSlice<T = ServiceSlice>(selector?: (state: ServiceSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.services;
    return selector ? selector(slice) : (slice as T);
  });
}
