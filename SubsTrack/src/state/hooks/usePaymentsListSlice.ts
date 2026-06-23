import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { PaymentsListSlice } from '@/src/state/slices/payments-list/paymentsListSlice';

export function usePaymentsListSlice(): PaymentsListSlice;
export function usePaymentsListSlice<T>(selector: (state: PaymentsListSlice) => T): T;
export function usePaymentsListSlice<T = PaymentsListSlice>(
  selector?: (state: PaymentsListSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.paymentsList;
    return selector ? selector(slice) : (slice as T);
  });
}
