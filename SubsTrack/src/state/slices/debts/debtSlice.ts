import type { StateCreator } from 'zustand';
import type {
  Customer,
  DebtItem,
  DebtPaymentItem,
} from '@/src/core/types';
import {
  debtService,
  type CreateCustomDebtInput,
  type CreateDebtPaymentInput,
} from '@/src/modules/transaction/debts';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

// The Debts-tab category chip (client-side only — never changes what is fetched).
// Debt payments live on their own sub-tab now, so 'payments' is no longer a chip.
export type DebtViewFilter = 'all' | 'months' | 'sales' | 'custom';

export interface DebtSlice {
  // Full branch dataset — customer + category filtering is done client-side in
  // the panel, so these hold every debt/payment for the current branch scope.
  items: DebtItem[];
  payments: DebtPaymentItem[];
  // Net debt in USD per customer (only positive nets), for the current branch
  // scope. Feeds the customer-list debt flag; independent of the panel filters.
  netByCustomer: Record<string, number>;
  loading: boolean;
  error: string | null;
  searchToken: number;
  // Client-side scope: null = all customers in the current branch view.
  customerFilter: Customer | null;
  // Client-side view chip (no re-fetch).
  categoryFilter: DebtViewFilter;
  fetchDebts: () => Promise<void>;
  // Refreshes the customer-list net-debt map for the current branch scope.
  fetchNetByCustomer: () => Promise<void>;
  setCustomerFilter: (customer: Customer | null) => void;
  setCategoryFilter: (category: DebtViewFilter) => void;
  clearFilters: () => void;
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
  netByCustomer: {},
  loading: false,
  error: null,
  searchToken: 0,
  customerFilter: null,
  categoryFilter: 'all',

  fetchDebts: async () => {
    const branchFilter = resolveBranchFilter(get().auth.user);
    // Self-bump the token so concurrent fetches (branch change + a mutation
    // refresh) resolve last-write-wins. Loads the full branch set — the panel
    // scopes by customer/category client-side.
    const token = get().debts.searchToken + 1;
    set((state) => {
      state.debts.searchToken = token;
      state.debts.loading = true;
      state.debts.error = null;
    });
    try {
      const view = await debtService.getDebtsView({ branchFilter });
      if (get().debts.searchToken !== token) return;
      set((state) => {
        state.debts.items = view.items;
        state.debts.payments = view.payments;
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

  fetchNetByCustomer: async () => {
    const branchFilter = resolveBranchFilter(get().auth.user);
    try {
      const net = await debtService.getNetUsdByCustomer(branchFilter);
      set((state) => {
        state.debts.netByCustomer = Object.fromEntries(net);
      });
    } catch {
      // A failed debt-flag refresh must never break the customer list — leave
      // the previous map in place (the panel surfaces real debt errors itself).
    }
  },

  // Client-side scope — no re-fetch (items/payments already hold the full set).
  setCustomerFilter: (customer) =>
    set((state) => {
      state.debts.customerFilter = customer;
    }),

  setCategoryFilter: (category) =>
    set((state) => {
      state.debts.categoryFilter = category;
    }),

  clearFilters: () =>
    set((state) => {
      state.debts.customerFilter = null;
      state.debts.categoryFilter = 'all';
    }),

  addCustomDebt: async (input) => {
    set((state) => {
      state.debts.loading = true;
      state.debts.error = null;
    });
    try {
      await debtService.addCustomDebt(input);
      await get().debts.fetchDebts();
      void get().debts.fetchNetByCustomer();
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
      void get().debts.fetchNetByCustomer();
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
      void get().debts.fetchNetByCustomer();
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
      void get().debts.fetchNetByCustomer();
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
      state.debts.netByCustomer = {};
      state.debts.loading = false;
      state.debts.error = null;
      state.debts.searchToken += 1;
      state.debts.customerFilter = null;
      state.debts.categoryFilter = 'all';
    }),
});
