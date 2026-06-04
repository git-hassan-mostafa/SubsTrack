import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { SignupSlice } from '@/src/state/slices/signup/signupSlice';

export function useSignupSlice(): SignupSlice;
export function useSignupSlice<T>(selector: (state: SignupSlice) => T): T;
export function useSignupSlice<T = SignupSlice>(selector?: (state: SignupSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.signup;
    return selector ? selector(slice) : (slice as T);
  });
}

export type { SignupCredentials } from '@/src/state/slices/signup/signupSlice';
