import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { DebtSlice } from '@/src/state/slices/debts/debtSlice';

export function useDebtSlice(): DebtSlice;
export function useDebtSlice<T>(selector: (state: DebtSlice) => T): T;
export function useDebtSlice<T = DebtSlice>(selector?: (state: DebtSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.debts;
    return selector ? selector(slice) : (slice as T);
  });
}
