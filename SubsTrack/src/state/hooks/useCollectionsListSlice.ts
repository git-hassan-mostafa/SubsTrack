import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { CollectionsListSlice } from '@/src/state/slices/collections/collectionsListSlice';

export function useCollectionsListSlice(): CollectionsListSlice;
export function useCollectionsListSlice<T>(selector: (state: CollectionsListSlice) => T): T;
export function useCollectionsListSlice<T = CollectionsListSlice>(
  selector?: (state: CollectionsListSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.collections;
    return selector ? selector(slice) : (slice as T);
  });
}
