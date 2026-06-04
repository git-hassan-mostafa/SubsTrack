import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { SubscriptionSlice } from '@/src/state/slices/subscription/subscriptionSlice';

export function useSubscriptionSlice(): SubscriptionSlice;
export function useSubscriptionSlice<T>(selector: (state: SubscriptionSlice) => T): T;
export function useSubscriptionSlice<T = SubscriptionSlice>(
  selector?: (state: SubscriptionSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.subscription;
    return selector ? selector(slice) : (slice as T);
  });
}

export const useGraceDays = (): number =>
  useGlobalStore((s) => s.subscription.currentTier?.graceDays ?? 0);
