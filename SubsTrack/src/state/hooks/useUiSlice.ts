import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { UiSlice } from '@/src/state/slices/ui/uiSlice';

export function useUiSlice(): UiSlice;
export function useUiSlice<T>(selector: (state: UiSlice) => T): T;
export function useUiSlice<T = UiSlice>(selector?: (state: UiSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.ui;
    return selector ? selector(slice) : (slice as T);
  });
}
