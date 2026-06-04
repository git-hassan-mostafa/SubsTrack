import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { PaymentSlice } from '@/src/state/slices/payments/paymentSlice';

export function usePaymentSlice(): PaymentSlice;
export function usePaymentSlice<T>(selector: (state: PaymentSlice) => T): T;
export function usePaymentSlice<T = PaymentSlice>(
  selector?: (state: PaymentSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.payments;
    return selector ? selector(slice) : (slice as T);
  });
}
