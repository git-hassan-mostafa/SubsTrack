import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { OptionSlice } from '@/src/state/slices/options/optionSlice';

export function useOptionSlice(): OptionSlice;
export function useOptionSlice<T>(selector: (state: OptionSlice) => T): T;
export function useOptionSlice<T = OptionSlice>(
  selector?: (state: OptionSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.options;
    return selector ? selector(slice) : (slice as T);
  });
}
