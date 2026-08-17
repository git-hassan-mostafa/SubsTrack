import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { ExpenseSlice } from '@/src/state/slices/expenses/expenseSlice';

export function useExpenseSlice(): ExpenseSlice;
export function useExpenseSlice<T>(selector: (state: ExpenseSlice) => T): T;
export function useExpenseSlice<T = ExpenseSlice>(selector?: (state: ExpenseSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.expenses;
    return selector ? selector(slice) : (slice as T);
  });
}
