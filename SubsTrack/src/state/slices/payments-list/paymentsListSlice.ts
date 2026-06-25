import type { StateCreator } from 'zustand';
import type { Currency, Customer } from '@/src/core/types';
import { PAGE_SIZE } from '@/src/core/constants';
import { getTodayDateString } from '@/src/core/utils/date';
import {
  paymentService,
  type PaymentListItem,
  type PaymentStatusFilter,
} from '@/src/modules/customer-payments';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

export interface PaymentsListSlice {
  items: PaymentListItem[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadingUpdate: boolean;
  error: string | null;
  searchToken: number;
  customerFilter: Customer | null;
  paidByUserId: string | null;
  // YYYY-MM-DD — defaults to today (payments recorded today).
  paidDate: string | null;
  billingMonth: string | null;
  statusFilter: PaymentStatusFilter;
  fetchPayments: () => Promise<void>;
  fetchMorePayments: () => Promise<void>;
  setCustomerFilter: (customer: Customer | null) => Promise<void>;
  setPaidByUserId: (userId: string | null) => Promise<void>;
  setPaidDate: (date: string | null) => Promise<void>;
  setBillingMonth: (month: string | null) => Promise<void>;
  setStatusFilter: (status: PaymentStatusFilter) => Promise<void>;
  clearFilters: () => Promise<void>;
  updatePayment: (
    id: string,
    amountDue: number,
    amountPaid: number,
    currency: Currency | null,
  ) => Promise<void>;
  voidPayments: (ids: string[], voidedBy: string, reason: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function buildOptions(state: PaymentsListSlice, page: number, branchFilter: ReturnType<typeof resolveBranchFilter>) {
  return {
    page,
    branchFilter,
    customerId: state.customerFilter?.id ?? null,
    receivedByUserId: state.paidByUserId,
    paidDate: state.paidDate,
    billingMonth: state.billingMonth,
    status: state.statusFilter,
  };
}

export const createPaymentsListSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  PaymentsListSlice
> = (set, get) => ({
  items: [],
  page: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  loadingUpdate: false,
  error: null,
  searchToken: 0,
  customerFilter: null,
  paidByUserId: null,
  paidDate: getTodayDateString(),
  billingMonth: null,
  statusFilter: 'all',

  fetchPayments: async () => {
    const token = get().paymentsList.searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.paymentsList.loading = true;
      state.paymentsList.error = null;
      state.paymentsList.page = 0;
    });
    try {
      const items = await paymentService.getPayments(
        buildOptions(get().paymentsList, 0, branchFilter),
      );
      if (get().paymentsList.searchToken !== token) return;
      set((state) => {
        state.paymentsList.items = items;
        state.paymentsList.hasMore = items.length === PAGE_SIZE;
        state.paymentsList.page = 0;
        state.paymentsList.loading = false;
      });
    } catch (e) {
      if (get().paymentsList.searchToken !== token) return;
      set((state) => {
        state.paymentsList.error = (e as Error).message;
        state.paymentsList.loading = false;
      });
    }
  },

  fetchMorePayments: async () => {
    const { loadingMore, hasMore, page, searchToken } = get().paymentsList;
    if (loadingMore || !hasMore) return;
    const token = searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.paymentsList.loadingMore = true;
    });
    try {
      const nextPage = page + 1;
      const items = await paymentService.getPayments(
        buildOptions(get().paymentsList, nextPage, branchFilter),
      );
      if (get().paymentsList.searchToken !== token) {
        set((state) => {
          state.paymentsList.loadingMore = false;
        });
        return;
      }
      set((state) => {
        state.paymentsList.items.push(...items);
        state.paymentsList.hasMore = items.length === PAGE_SIZE;
        state.paymentsList.page = nextPage;
        state.paymentsList.loadingMore = false;
      });
    } catch (e) {
      if (get().paymentsList.searchToken !== token) {
        set((state) => {
          state.paymentsList.loadingMore = false;
        });
        return;
      }
      set((state) => {
        state.paymentsList.error = (e as Error).message;
        state.paymentsList.loadingMore = false;
      });
    }
  },

  setCustomerFilter: async (customer) => {
    if (get().paymentsList.customerFilter?.id === customer?.id) return;
    set((state) => {
      state.paymentsList.customerFilter = customer;
      state.paymentsList.searchToken += 1;
      state.paymentsList.page = 0;
      state.paymentsList.items = [];
      state.paymentsList.hasMore = true;
    });
    await get().paymentsList.fetchPayments();
  },

  setPaidByUserId: async (userId) => {
    if (get().paymentsList.paidByUserId === userId) return;
    set((state) => {
      state.paymentsList.paidByUserId = userId;
      state.paymentsList.searchToken += 1;
      state.paymentsList.page = 0;
      state.paymentsList.items = [];
      state.paymentsList.hasMore = true;
    });
    await get().paymentsList.fetchPayments();
  },

  setPaidDate: async (date) => {
    if (get().paymentsList.paidDate === date) return;
    set((state) => {
      state.paymentsList.paidDate = date;
      state.paymentsList.searchToken += 1;
      state.paymentsList.page = 0;
      state.paymentsList.items = [];
      state.paymentsList.hasMore = true;
    });
    await get().paymentsList.fetchPayments();
  },

  setBillingMonth: async (month) => {
    if (get().paymentsList.billingMonth === month) return;
    set((state) => {
      state.paymentsList.billingMonth = month;
      state.paymentsList.searchToken += 1;
      state.paymentsList.page = 0;
      state.paymentsList.items = [];
      state.paymentsList.hasMore = true;
    });
    await get().paymentsList.fetchPayments();
  },

  setStatusFilter: async (status) => {
    if (get().paymentsList.statusFilter === status) return;
    set((state) => {
      state.paymentsList.statusFilter = status;
      state.paymentsList.searchToken += 1;
      state.paymentsList.page = 0;
      state.paymentsList.items = [];
      state.paymentsList.hasMore = true;
    });
    await get().paymentsList.fetchPayments();
  },

  // Resets to the default view: payments recorded today.
  clearFilters: async () => {
    set((state) => {
      state.paymentsList.customerFilter = null;
      state.paymentsList.paidByUserId = null;
      state.paymentsList.paidDate = getTodayDateString();
      state.paymentsList.billingMonth = null;
      state.paymentsList.statusFilter = 'all';
      state.paymentsList.searchToken += 1;
      state.paymentsList.page = 0;
      state.paymentsList.items = [];
      state.paymentsList.hasMore = true;
    });
    await get().paymentsList.fetchPayments();
  },

  updatePayment: async (id, amountDue, amountPaid, currency) => {
    set((state) => {
      state.paymentsList.loadingUpdate = true;
      state.paymentsList.error = null;
    });
    try {
      const updated = await paymentService.updatePayment(id, amountDue, amountPaid, currency);
      set((state) => {
        // Merge the updated fields over the existing row, preserving its
        // joined customerName. If the edit clears the balance to 0 it stays
        // in the list (it's still a settled payment).
        state.paymentsList.items = state.paymentsList.items.map((p) =>
          p.id === id ? { ...p, ...updated } : p,
        );
        state.paymentsList.loadingUpdate = false;
      });
    } catch (e) {
      set((state) => {
        state.paymentsList.error = (e as Error).message;
        state.paymentsList.loadingUpdate = false;
      });
    }
  },

  voidPayments: async (ids, voidedBy, reason) => {
    if (ids.length === 0) return;
    set((state) => {
      state.paymentsList.loading = true;
      state.paymentsList.error = null;
    });
    try {
      await paymentService.voidPayments(ids, voidedBy, reason);
      set((state) => {
        const removed = new Set(ids);
        // Voided payments fall out of the list (it shows settled rows only).
        state.paymentsList.items = state.paymentsList.items.filter((p) => !removed.has(p.id));
        state.paymentsList.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.paymentsList.error = (e as Error).message;
        state.paymentsList.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.paymentsList.error = null;
    }),

  reset: () =>
    set((state) => {
      state.paymentsList.items = [];
      state.paymentsList.page = 0;
      state.paymentsList.hasMore = true;
      state.paymentsList.loading = false;
      state.paymentsList.loadingMore = false;
      state.paymentsList.loadingUpdate = false;
      state.paymentsList.error = null;
      state.paymentsList.searchToken += 1;
      state.paymentsList.customerFilter = null;
      state.paymentsList.paidByUserId = null;
      state.paymentsList.paidDate = getTodayDateString();
      state.paymentsList.billingMonth = null;
      state.paymentsList.statusFilter = 'all';
    }),
});
