import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { CustomerPlanSlice } from '@/src/state/slices/customer-plans/customerPlanSlice';

export function useCustomerPlanSlice(): CustomerPlanSlice;
export function useCustomerPlanSlice<T>(selector: (state: CustomerPlanSlice) => T): T;
export function useCustomerPlanSlice<T = CustomerPlanSlice>(
  selector?: (state: CustomerPlanSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.customerPlans;
    return selector ? selector(slice) : (slice as T);
  });
}
