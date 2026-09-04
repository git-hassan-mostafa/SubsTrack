import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ExpenseCategory, ExpenseItem, ExpenseSummary } from '@/src/core/types';
import {
  expenseService,
  expenseToItem,
  type CreateExpenseInput,
} from '@/src/modules/transaction/expenses';
import { ownedRowMatchesFilter, resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { currentMonthDays, rangeFromDays } from '@/src/core/utils/dateRange';
import { getStore } from '@/src/state/globalStore';

// A MODULE store, not a global slice: only the expenses module reads it, and no
// slice reads it back. `auth` is read across through the global store — the one allowed
// direction.
// See CLAUDE.md → State Management.

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

export interface ExpenseState {
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

export const useExpenseStore = create<ExpenseState>()(
  immer((set, get) => ({
    items: [],
    summary: EMPTY_SUMMARY,
    loading: false,
    error: null,
    searchToken: 0,
    ...currentMonthDays(),
    search: '',
    categoryFilter: 'all',

    fetchExpenses: async () => {
      const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
      const { fromDate, toDate } = get();
      // Self-bump the token so concurrent fetches (branch change + a mutation
      // refresh) resolve last-write-wins.
      const token = get().searchToken + 1;
      set((state) => {
        state.searchToken = token;
        state.loading = true;
        state.error = null;
      });
      try {
        const view = await expenseService.getExpensesView({
          ...rangeFromDays(fromDate, toDate),
          branchFilter,
        });
        if (get().searchToken !== token) return;
        set((state) => {
          state.items = view.items;
          state.summary = view.summary;
          state.loading = false;
        });
      } catch (e) {
        if (get().searchToken !== token) return;
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
      }
    },

    setDateRange: async (from, to) => {
      set((state) => {
        state.fromDate = from;
        state.toDate = to;
      });
      await get().fetchExpenses();
    },

    // Client-side only — items already hold the whole fetched window.
    setSearch: (term) =>
      set((state) => {
        state.search = term;
      }),

    setCategoryFilter: (category) =>
      set((state) => {
        state.categoryFilter = category;
      }),

    clearFilters: async () => {
      const { fromDate, toDate } = currentMonthDays();
      set((state) => {
        state.search = '';
        state.categoryFilter = 'all';
        state.fromDate = fromDate;
        state.toDate = toDate;
      });
      await get().fetchExpenses();
    },

    addExpense: async (input) => {
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const expense = await expenseService.addExpense(input);
        const item = expenseToItem(expense);
        const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
        set((state) => {
          state.loading = false;
          // An expense dated outside the shown window, or belonging to a branch
          // this view excludes, is written but has no place on this screen.
          if (!inWindow(item.date, state)) return;
          if (!ownedRowMatchesFilter(item.branchId, branchFilter)) return;
          state.items = insertByDateDesc(state.items, item);
          addToSummary(state.summary, item, 1);
        });
        return true;
      } catch (e) {
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
        return false;
      }
    },

    voidExpense: async (id, voidedBy, reason) => {
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        await expenseService.voidExpense(id, voidedBy, reason);
        set((state) => {
          state.loading = false;
          const itemId = `exp:${id}`;
          const gone = state.items.find((i) => i.id === itemId);
          if (!gone) return;
          // A voided expense simply stops being money out — the list hides it.
          state.items = state.items.filter((i) => i.id !== itemId);
          addToSummary(state.summary, gone, -1);
        });
      } catch (e) {
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
      }
    },

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    reset: () =>
      set((state) => {
        const { fromDate, toDate } = currentMonthDays();
        state.items = [];
        state.summary = EMPTY_SUMMARY;
        state.loading = false;
        state.error = null;
        state.searchToken += 1;
        state.fromDate = fromDate;
        state.toDate = toDate;
        state.search = '';
        state.categoryFilter = 'all';
      }),
  })),
);
