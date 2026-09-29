import { useGlobalStore } from "@shared/state/hooks/useGlobalStore";
import type { BillingSlice } from "@shared/state/slices/billing/billingSlice";

export function useBillingSlice(): BillingSlice;
export function useBillingSlice<T>(selector: (state: BillingSlice) => T): T;
export function useBillingSlice<T = BillingSlice>(
  selector?: (state: BillingSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.billing;
    return selector ? selector(slice) : (slice as T);
  });
}
