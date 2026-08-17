import type { StateCreator } from 'zustand';
import type { ExpenseCategory, ExpenseItem, ExpenseSummary } from '@/src/core/types';
import {
  expenseService,
  type CreateExpenseInput,
} from '@/src/modules/transaction/expenses';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

const EMPTY_SUMMARY: ExpenseSummary = { totalUsd: 0, manualUsd: 0, stockUsd: 0 };

// Start of the current month → start of the next, as ISO. Expenses are read a
// month at a time by default: that is the grain the owner thinks in, and it
// keeps the derived stock half cheap.
function currentMonthRange(): { startIso: string; endExclusiveIso: string } {
  const now = new Date();
  return {
    startIso: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    endExclusiveIso: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  };
}

export interface ExpenseSlice {
  // Both sources merged (stored expenses + derived stock purchases), newest first.
  items: ExpenseItem[];
  summary: ExpenseSummary;
  loading: boolean;
  error: string | null;
  searchToken: number;
  // The fetched window — 'YYYY-MM-DD' day bounds, both inclusive, as the date
  // chips present them. Changing either re-fetches.
  fromDate: string;
  toDate: string;
  // Client-side chips (no re-fetch).
  search: string;
  categoryFilter: ExpenseCategory | 'all';
  fetchExpenses: () => Promise<void>;
  setDateRange: (from: string, to: string) => Promise<void>;
  setSearch: (term: string) => void;
  setCategoryFilter: (category: ExpenseCategory | 'all') => void;
  clearFilters: () => Promise<void>;
  addExpense: (input: CreateExpenseInput) => Promise<boolean>;
  voidExpense: (id: string, voidedBy: string, reason: string | null) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function defaultDates(): { fromDate: string; toDate: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { fromDate: toDay(first), toDate: toDay(last) };
}

function toDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' day bounds → the ISO instants the service wants (end exclusive =
// the start of the following day, so the last day is included).
function rangeFromDays(from: string, to: string): { startIso: string; endExclusiveIso: string } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (!fy || !ty) return currentMonthRange();
  return {
    startIso: new Date(fy, fm - 1, fd).toISOString(),
    endExclusiveIso: new Date(ty, tm - 1, td + 1).toISOString(),
  };
}

export const createExpenseSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  ExpenseSlice
> = (set, get) => ({
  items: [],
  summary: EMPTY_SUMMARY,
  loading: false,
  error: null,
  searchToken: 0,
  ...defaultDates(),
  search: '',
  categoryFilter: 'all',

  fetchExpenses: async () => {
    const branchFilter = resolveBranchFilter(get().auth.user);
    const { fromDate, toDate } = get().expenses;
    // Self-bump the token so concurrent fetches (branch change + a mutation
    // refresh) resolve last-write-wins.
    const token = get().expenses.searchToken + 1;
    set((state) => {
      state.expenses.searchToken = token;
      state.expenses.loading = true;
      state.expenses.error = null;
    });
    try {
      const view = await expenseService.getExpensesView({
        ...rangeFromDays(fromDate, toDate),
        branchFilter,
      });
      if (get().expenses.searchToken !== token) return;
      set((state) => {
        state.expenses.items = view.items;
        state.expenses.summary = view.summary;
        state.expenses.loading = false;
      });
    } catch (e) {
      if (get().expenses.searchToken !== token) return;
      set((state) => {
        state.expenses.error = (e as Error).message;
        state.expenses.loading = false;
      });
    }
  },

  setDateRange: async (from, to) => {
    set((state) => {
      state.expenses.fromDate = from;
      state.expenses.toDate = to;
    });
    await get().expenses.fetchExpenses();
  },

  // Client-side only — items already hold the whole fetched window.
  setSearch: (term) =>
    set((state) => {
      state.expenses.search = term;
    }),

  setCategoryFilter: (category) =>
    set((state) => {
      state.expenses.categoryFilter = category;
    }),

  clearFilters: async () => {
    const { fromDate, toDate } = defaultDates();
    set((state) => {
      state.expenses.search = '';
      state.expenses.categoryFilter = 'all';
      state.expenses.fromDate = fromDate;
      state.expenses.toDate = toDate;
    });
    await get().expenses.fetchExpenses();
  },

  addExpense: async (input) => {
    set((state) => {
      state.expenses.loading = true;
      state.expenses.error = null;
    });
    try {
      await expenseService.addExpense(input);
      await get().expenses.fetchExpenses();
      return true;
    } catch (e) {
      set((state) => {
        state.expenses.error = (e as Error).message;
        state.expenses.loading = false;
      });
      return false;
    }
  },

  voidExpense: async (id, voidedBy, reason) => {
    set((state) => {
      state.expenses.loading = true;
      state.expenses.error = null;
    });
    try {
      await expenseService.voidExpense(id, voidedBy, reason);
      await get().expenses.fetchExpenses();
    } catch (e) {
      set((state) => {
        state.expenses.error = (e as Error).message;
        state.expenses.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.expenses.error = null;
    }),

  reset: () =>
    set((state) => {
      const { fromDate, toDate } = defaultDates();
      state.expenses.items = [];
      state.expenses.summary = EMPTY_SUMMARY;
      state.expenses.loading = false;
      state.expenses.error = null;
      state.expenses.searchToken += 1;
      state.expenses.fromDate = fromDate;
      state.expenses.toDate = toDate;
      state.expenses.search = '';
      state.expenses.categoryFilter = 'all';
    }),
});
