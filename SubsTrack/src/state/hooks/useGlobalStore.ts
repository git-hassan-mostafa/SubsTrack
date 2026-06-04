import { useStore } from 'zustand';
import { getStore, type GlobalState } from '@/src/state/globalStore';

export function useGlobalStore(): GlobalState;
export function useGlobalStore<T>(selector: (state: GlobalState) => T): T;
export function useGlobalStore<T = GlobalState>(selector?: (state: GlobalState) => T): T {
  const store = getStore();
  return useStore(store, selector ?? ((s: GlobalState) => s as T));
}
