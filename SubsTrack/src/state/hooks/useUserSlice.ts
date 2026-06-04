import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { UserSlice } from '@/src/state/slices/users/userSlice';

export function useUserSlice(): UserSlice;
export function useUserSlice<T>(selector: (state: UserSlice) => T): T;
export function useUserSlice<T = UserSlice>(selector?: (state: UserSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.users;
    return selector ? selector(slice) : (slice as T);
  });
}
