import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { AuthSlice } from '@/src/state/slices/auth/authSlice';

export function useAuthSlice(): AuthSlice;
export function useAuthSlice<T>(selector: (state: AuthSlice) => T): T;
export function useAuthSlice<T = AuthSlice>(selector?: (state: AuthSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.auth;
    return selector ? selector(slice) : (slice as T);
  });
}
