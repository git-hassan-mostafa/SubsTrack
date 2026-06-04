import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { ConfirmSlice } from '@/src/state/slices/confirm/confirmSlice';

export function useConfirmSlice(): ConfirmSlice;
export function useConfirmSlice<T>(selector: (state: ConfirmSlice) => T): T;
export function useConfirmSlice<T = ConfirmSlice>(selector?: (state: ConfirmSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.confirm;
    return selector ? selector(slice) : (slice as T);
  });
}
