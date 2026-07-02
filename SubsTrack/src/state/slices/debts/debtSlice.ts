import type { StateCreator } from 'zustand';
import type {
  Customer,
  DebtItem,
  DebtPaymentItem,
  DebtSummary,
} from '@/src/core/types';
import {
  debtService,
  type CreateCustomDebtInput,
  type CreateDebtPaymentInput,
} from '@/src/modules/debts';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

// The flat-list category chip. 'payments' shows the debt-payment rows instead of
// the debt items. Purely client-side — it never changes what is fetched.
export type DebtViewFilter = 'all' | 'months' | 'sales' | 'custom' | 'payments';

const EMPTY_SUMMARY: DebtSummary = { grossUsd: 0, paymentsUsd: 0, netUsd: 0 };

export interface DebtSlice {
  items: DebtItem[];
  payments: DebtPaymentItem[];
  summary: DebtSummary;
  loading: boolean;
  error: string | null;
  searchToken: number;
  // Scope: null = all customers in the current branch view.
  customerFilter: Customer | null;
  // Client-side view chip (no re-fetch).
  categoryFilter: DebtViewFilter;
  fetchDebts: () => Promise<void>;
  setCustomerFilter: (customer: Customer | null) => Promise<void>;
  setCategoryFilter: (category: DebtViewFilter) => void;
  clearFilters: () => Promise<void>;
  addCustomDebt: (input: CreateCustomDebtInput) => Promise<boolean>;
  addDebtPayment: (input: CreateDebtPaymentInput) => Promise<boolean>;
  voidCustomDebt: (id: string, voidedBy: string, reason: string | null) => Promise<void>;
  voidDebtPayment: (id: string, voidedBy: string, reason: string | null) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createDebtSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  DebtSlice
> = (set, get) => ({
  items: [],
  payments: [],
  summary: EMPTY_SUMMARY,
  loading: false,
  error: null,
  searchToken: 0,
  customerFilter: null,
  categoryFilter: 'all',

  fetchDebts: async () => {
    const token = get().debts.searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    const { customerFilter } = get().debts;
    set((state) => {
      state.debts.loading = true;
      state.debts.error = null;
    });
    try {
      const view = await debtService.getDebtsView({
        branchFilter,
        customerId: customerFilter?.id ?? null,
      });
      if (get().debts.searchToken !== token) return;
      set((state) => {
        state.debts.items = view.items;
        state.debts.payments = view.payments;
        state.debts.summary = view.summary;
        state.debts.loading = false;
      });
    } catch (e) {
      if (get().debts.searchToken !== token) return;
      set((state) => {
        state.debts.error = (e as Error).message;
        state.debts.loading = false;
      });
    }
  },

  setCustomerFilter: async (customer) => {
    if (get().debts.customerFilter?.id === customer?.id) return;
    set((state) => {
      state.debts.customerFilter = customer;
      state.debts.searchToken += 1;
    });
    await get().debts.fetchDebts();
  },

  setCategoryFilter: (category) =>
    set((state) => {
      state.debts.categoryFilter = category;
    }),

  clearFilters: async () => {
    const changed = get().debts.customerFilter !== null || get().debts.categoryFilter !== 'all';
    if (!changed) return;
    set((state) => {
      state.debts.customerFilter = null;
      state.debts.categoryFilter = 'all';
      state.debts.searchToken += 1;
    });
    await get().debts.fetchDebts();
  },

  addCustomDebt: async (input) => {
    set((state) => {
      state.debts.loading = true;
      state.debts.error = null;
    });
    try {
      await debtService.addCustomDebt(input);
      await get().debts.fetchDebts();
      return true;
    } catch (e) {
      set((state) => {
        state.debts.error = (e as Error).message;
        state.debts.loading = false;
      });
      return false;
    }
  },

  addDebtPayment: async (input) => {
    set((state) => {
      state.debts.loading = true;
      state.debts.error = null;
    });
    try {
      await debtService.addDebtPayment(input);
      await get().debts.fetchDebts();
      return true;
    } catch (e) {
      set((state) => {
        state.debts.error = (e as Error).message;
        state.debts.loading = false;
      });
      return false;
    }
  },

  voidCustomDebt: async (id, voidedBy, reason) => {
    set((state) => {
      state.debts.loading = true;
      state.debts.error = null;
    });
    try {
      await debtService.voidCustomDebt(id, voidedBy, reason);
      await get().debts.fetchDebts();
    } catch (e) {
      set((state) => {
        state.debts.error = (e as Error).message;
        state.debts.loading = false;
      });
    }
  },

  voidDebtPayment: async (id, voidedBy, reason) => {
    set((state) => {
      state.debts.loading = true;
      state.debts.error = null;
    });
    try {
      await debtService.voidDebtPayment(id, voidedBy, reason);
      await get().debts.fetchDebts();
    } catch (e) {
      set((state) => {
        state.debts.error = (e as Error).message;
        state.debts.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.debts.error = null;
    }),

  reset: () =>
    set((state) => {
      state.debts.items = [];
      state.debts.payments = [];
      state.debts.summary = EMPTY_SUMMARY;
      state.debts.loading = false;
      state.debts.error = null;
      state.debts.searchToken += 1;
      state.debts.customerFilter = null;
      state.debts.categoryFilter = 'all';
    }),
});
