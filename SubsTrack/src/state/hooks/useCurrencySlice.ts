import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { CurrencySlice } from '@/src/state/slices/currencies/currencySlice';

export function useCurrencySlice(): CurrencySlice;
export function useCurrencySlice<T>(selector: (state: CurrencySlice) => T): T;
export function useCurrencySlice<T = CurrencySlice>(
  selector?: (state: CurrencySlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.currencies;
    return selector ? selector(slice) : (slice as T);
  });
}
