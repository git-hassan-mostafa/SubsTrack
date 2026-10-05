import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  ExpenseItem,
  ExpenseSummary,
} from "@shared/core/types";
import expenseService from "@shared/modules/transaction/expenses/services/ExpenseService";
import {
  EXPENSE_DEFAULT_PRESET,
  type ExpenseCategoryFilter,
} from "@shared/modules/transaction/expenses/utils/expenseList";
import { expenseToItem, storedExpenseId } from "@shared/modules/transaction/expenses/utils/mapper";
import type { CreateExpenseInput } from "@shared/modules/transaction/expenses/utils/types";
import {
  ownedRowMatchesFilter,
  resolveBranchFilter,
} from "@shared/shared/lib/branchFilter";
import {
  periodFromPreset,
  toRange,
  type ReportPeriod,
} from "@shared/core/utils/dateRange";
import { getStore } from "@shared/state/globalStore";

const EMPTY_SUMMARY: ExpenseSummary = {
  totalUsd: 0,
  manualUsd: 0,
  stockUsd: 0,
};

function defaultPeriod(): ReportPeriod {
  return periodFromPreset(EXPENSE_DEFAULT_PRESET);
}

function inPeriod(date: string, period: ReportPeriod): boolean {
  const day = date.slice(0, 10);
  return day >= period.fromDate && day <= period.toDate;
}

// Newest first, the order getExpensesView returns.
function insertByDateDesc(
  items: ExpenseItem[],
  item: ExpenseItem,
): ExpenseItem[] {
  const at = items.findIndex((i) => i.date.localeCompare(item.date) < 0);
  const next = [...items];
  next.splice(at === -1 ? items.length : at, 0, item);
  return next;
}

function addToSummary(
  summary: ExpenseSummary,
  item: ExpenseItem,
  sign: 1 | -1,
): void {
  const usd = (sign * item.amount) / item.ratePerUsdSnapshot;
  summary.totalUsd += usd;
  if (item.source === "stock") summary.stockUsd += usd;
  else summary.manualUsd += usd;
}

export interface ExpenseState {
  items: ExpenseItem[];
  summary: ExpenseSummary;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  searchToken: number;
  period: ReportPeriod;
  categoryFilter: ExpenseCategoryFilter;
  fetchExpenses: () => Promise<void>;
  setPeriod: (period: ReportPeriod) => Promise<void>;
  setCategoryFilter: (category: ExpenseCategoryFilter) => void;
  clearFilters: () => Promise<void>;
  addExpense: (input: CreateExpenseInput) => Promise<boolean>;
  voidExpense: (item: ExpenseItem, voidedBy: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useExpenseStore = create<ExpenseState>()(
  immer((set, get) => ({
    items: [],
    summary: EMPTY_SUMMARY,
    loaded: false,
    loading: false,
    error: null,
    searchToken: 0,
    period: defaultPeriod(),
    categoryFilter: "all",

    fetchExpenses: async () => {
      const branchFilter = resolveBranchFilter(getStore().getState().auth.user);
      const { period } = get();
      const token = get().searchToken + 1;
      set((state) => {
        state.searchToken = token;
        state.loading = true;
        state.error = null;
      });
      try {
        const view = await expenseService.getExpensesView({
          ...toRange(period),
          branchFilter,
        });
        if (get().searchToken !== token) return;
        set((state) => {
          state.items = view.items;
          state.summary = view.summary;
          state.loaded = true;
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

    setPeriod: async (period) => {
      set((state) => {
        state.period = period;
      });
      await get().fetchExpenses();
    },

    setCategoryFilter: (category) =>
      set((state) => {
        state.categoryFilter = category;
      }),

    clearFilters: async () => {
      set((state) => {
        state.categoryFilter = "all";
        state.period = defaultPeriod();
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
        const branchFilter = resolveBranchFilter(
          getStore().getState().auth.user,
        );
        set((state) => {
          state.loading = false;
          if (!state.loaded) return;
          if (!inPeriod(item.date, state.period)) return;
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

    voidExpense: async (item, voidedBy) => {
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        await expenseService.voidExpense(storedExpenseId(item), voidedBy, null);
        set((state) => {
          state.loading = false;
          const gone = state.items.find((i) => i.id === item.id);
          if (!gone) return;
          state.items = state.items.filter((i) => i.id !== item.id);
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
        state.items = [];
        state.summary = EMPTY_SUMMARY;
        state.loaded = false;
        state.loading = false;
        state.error = null;
        state.searchToken += 1;
        state.period = defaultPeriod();
        state.categoryFilter = "all";
      }),
  })),
);
