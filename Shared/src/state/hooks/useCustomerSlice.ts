import { useGlobalStore } from "@shared/state/hooks/useGlobalStore";
import type { CustomerSlice } from "@shared/state/slices/customers/customerSlice";

export function useCustomerSlice(): CustomerSlice;
export function useCustomerSlice<T>(selector: (state: CustomerSlice) => T): T;
export function useCustomerSlice<T = CustomerSlice>(
  selector?: (state: CustomerSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.customers;
    return selector ? selector(slice) : (slice as T);
  });
}
