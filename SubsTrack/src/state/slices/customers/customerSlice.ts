import type { StateCreator } from 'zustand';
import type { Customer, TierPlan, TenantUsage } from '@/src/core/types';
import { CustomerService } from '@/src/modules/customers/services/CustomerService';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { TierLimitError } from '@/src/modules/subscription/services/TierService';
import type { TierLimitErrorPayload } from '@/src/modules/subscription/components/UpgradePromptModal';
import type { GlobalState } from '@/src/state/globalStore';

const customerService = new CustomerService();

interface CustomerInput {
  name: string;
  phoneNumber: string | null;
  address: string | null;
  area: string | null;
  notes: string | null;
  planId: string | null;
  branchId: string | null;
  startDate: string;
  isRegular: boolean;
}

export interface CustomerSlice {
  items: Customer[];
  totalCount: number;
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  searchQuery: string;
  searchToken: number;
  getCustomers: () => Promise<void>;
  fetchCustomers: () => Promise<void>;
  fetchMoreCustomers: () => Promise<void>;
  setSearchQuery: (q: string) => Promise<void>;
  getCustomer: (id: string) => Promise<Customer | null>;
  fetchCustomer: (id: string) => Promise<Customer | null>;
  createCustomer: (
    data: CustomerInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ) => Promise<void>;
  updateCustomer: (id: string, data: CustomerInput) => Promise<void>;
  deactivateCustomer: (id: string) => Promise<void>;
  reactivateCustomer: (id: string) => Promise<void>;
  deleteCustomer: (id: string) => Promise<'hard' | 'soft' | null>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createCustomerSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  CustomerSlice
> = (set, get) => ({
  items: [],
  totalCount: 0,
  page: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  error: null,
  tierLimitError: null,
  searchQuery: '',
  searchToken: 0,

  getCustomers: async () => {
    if (get().customers.items.length > 0) return;
    await get().customers.fetchCustomers();
  },

  fetchCustomers: async () => {
    const token = get().customers.searchToken;
    const query = get().customers.searchQuery;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
      state.customers.page = 0;
    });
    try {
      const { customers, hasMore, totalCount } = await customerService.getCustomers(
        0,
        query,
        branchFilter,
      );
      if (get().customers.searchToken !== token) return;
      set((state) => {
        state.customers.items = customers;
        state.customers.hasMore = hasMore;
        state.customers.totalCount = totalCount;
        state.customers.page = 0;
        state.customers.loading = false;
      });
    } catch (e) {
      if (get().customers.searchToken !== token) return;
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
    }
  },

  fetchMoreCustomers: async () => {
    const { loadingMore, hasMore, page, searchToken, searchQuery } = get().customers;
    if (loadingMore || !hasMore) return;
    const token = searchToken;
    const branchFilter = resolveBranchFilter(get().auth.user);
    set((state) => {
      state.customers.loadingMore = true;
    });
    try {
      const nextPage = page + 1;
      const { customers, hasMore: more } = await customerService.getCustomers(
        nextPage,
        searchQuery,
        branchFilter,
      );
      if (get().customers.searchToken !== token) {
        set((state) => {
          state.customers.loadingMore = false;
        });
        return;
      }
      set((state) => {
        state.customers.items.push(...customers);
        state.customers.hasMore = more;
        state.customers.page = nextPage;
        state.customers.loadingMore = false;
      });
    } catch (e) {
      if (get().customers.searchToken !== token) {
        set((state) => {
          state.customers.loadingMore = false;
        });
        return;
      }
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loadingMore = false;
      });
    }
  },

  setSearchQuery: async (q) => {
    const trimmed = q.trim();
    if (trimmed === get().customers.searchQuery) return;
    set((state) => {
      state.customers.searchQuery = trimmed;
      state.customers.searchToken += 1;
      state.customers.page = 0;
      state.customers.items = [];
      state.customers.hasMore = true;
    });
    await get().customers.fetchCustomers();
  },

  getCustomer: async (id) => {
    const existing = get().customers.items.find((c) => c.id === id);
    if (existing) return existing;
    return await get().customers.fetchCustomer(id);
  },

  fetchCustomer: async (id) => {
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const customer = await customerService.getCustomer(id);
      set((state) => {
        const i = state.customers.items.findIndex((c) => c.id === id);
        if (i !== -1) state.customers.items[i] = customer;
        else state.customers.items.push(customer);
        state.customers.loading = false;
      });
      return customer;
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
      return null;
    }
  },

  createCustomer: async (data, tenantId, tier, usage) => {
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
      state.customers.tierLimitError = null;
    });
    try {
      const customer = await customerService.createCustomer(data, tenantId, tier, usage);
      set((state) => {
        state.customers.items.unshift(customer);
        state.customers.totalCount += 1;
        state.customers.loading = false;
      });
      void get().subscription.refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set((state) => {
          state.customers.tierLimitError = {
            resource: e.resource,
            limit: e.limit,
            tierCode: e.tierCode,
          };
          state.customers.loading = false;
        });
      } else {
        set((state) => {
          state.customers.error = (e as Error).message;
          state.customers.loading = false;
        });
      }
    }
  },

  updateCustomer: async (id, data) => {
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const updated = await customerService.updateCustomer(id, data);
      set((state) => {
        const i = state.customers.items.findIndex((c) => c.id === id);
        if (i !== -1) state.customers.items[i] = updated;
        state.customers.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
    }
  },

  deactivateCustomer: async (id) => {
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const updated = await customerService.deactivateCustomer(id);
      set((state) => {
        const i = state.customers.items.findIndex((c) => c.id === id);
        if (i !== -1) state.customers.items[i] = updated;
        state.customers.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
    }
  },

  reactivateCustomer: async (id) => {
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const updated = await customerService.reactivateCustomer(id);
      set((state) => {
        const i = state.customers.items.findIndex((c) => c.id === id);
        if (i !== -1) state.customers.items[i] = updated;
        state.customers.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
    }
  },

  deleteCustomer: async (id) => {
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const result = await customerService.deleteCustomer(id);
      if (result.mode === 'hard') {
        set((state) => {
          state.customers.items = state.customers.items.filter((c) => c.id !== id);
          state.customers.totalCount = Math.max(0, state.customers.totalCount - 1);
          state.customers.loading = false;
        });
      } else {
        set((state) => {
          const i = state.customers.items.findIndex((c) => c.id === id);
          if (i !== -1) state.customers.items[i] = result.customer;
          state.customers.loading = false;
        });
      }
      return result.mode;
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
      return null;
    }
  },

  clearError: () =>
    set((state) => {
      state.customers.error = null;
    }),
  clearTierLimitError: () =>
    set((state) => {
      state.customers.tierLimitError = null;
    }),
  reset: () =>
    set((state) => {
      state.customers.items = [];
      state.customers.totalCount = 0;
      state.customers.page = 0;
      state.customers.hasMore = true;
      state.customers.tierLimitError = null;
      state.customers.searchQuery = '';
      state.customers.searchToken += 1;
    }),
});
