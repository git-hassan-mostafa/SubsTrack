import type { StateCreator } from 'zustand';
import type { ExpenseCategory, ExpenseItem, ExpenseSummary } from '@/src/core/types';
import {
  expenseService,
  expenseToItem,
  type CreateExpenseInput,
} from '@/src/modules/transaction/expenses';
import { ownedRowMatchesFilter, resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { currentMonthDays, rangeFromDays } from '@/src/core/utils/dateRange';
import type { GlobalState } from '@/src/state/globalStore';

const EMPTY_SUMMARY: ExpenseSummary = { totalUsd: 0, manualUsd: 0, stockUsd: 0 };

/** Is this row inside the fetched day window? Both bounds are inclusive days. */
function inWindow(date: string, window: { fromDate: string; toDate: string }): boolean {
  const day = date.slice(0, 10);
  return day >= window.fromDate && day <= window.toDate;
}

/** Newest first — the order `getExpensesView` returns, kept on an insert. */
function insertByDateDesc(items: ExpenseItem[], item: ExpenseItem): ExpenseItem[] {
  const at = items.findIndex((i) => i.date.localeCompare(item.date) < 0);
  const next = [...items];
  next.splice(at === -1 ? items.length : at, 0, item);
  return next;
}

/** One row in (`sign` 1) or out (-1) of the totals, in USD via its frozen rate. */
function addToSummary(summary: ExpenseSummary, item: ExpenseItem, sign: 1 | -1): void {
  const usd = (sign * item.amount) / item.ratePerUsdSnapshot;
  summary.totalUsd += usd;
  if (item.source === 'stock') summary.stockUsd += usd;
  else summary.manualUsd += usd;
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
  ...currentMonthDays(),
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
    const { fromDate, toDate } = currentMonthDays();
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
      const expense = await expenseService.addExpense(input);
      const item = expenseToItem(expense);
      const branchFilter = resolveBranchFilter(get().auth.user);
      set((state) => {
        state.expenses.loading = false;
        // An expense dated outside the shown window, or belonging to a branch
        // this view excludes, is written but has no place on this screen.
        if (!inWindow(item.date, state.expenses)) return;
        if (!ownedRowMatchesFilter(item.branchId, branchFilter)) return;
        state.expenses.items = insertByDateDesc(state.expenses.items, item);
        addToSummary(state.expenses.summary, item, 1);
      });
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
      set((state) => {
        state.expenses.loading = false;
        const itemId = `exp:${id}`;
        const gone = state.expenses.items.find((i) => i.id === itemId);
        if (!gone) return;
        // A voided expense simply stops being money out — the list hides it.
        state.expenses.items = state.expenses.items.filter((i) => i.id !== itemId);
        addToSummary(state.expenses.summary, gone, -1);
      });
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
      const { fromDate, toDate } = currentMonthDays();
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
