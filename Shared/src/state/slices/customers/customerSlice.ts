import type { StateCreator } from "zustand";
import type { Customer, CustomerPlan } from "@shared/core/types";
import customerService from "@shared/modules/customer/customers/services/CustomerService";
import type { CustomerInput } from "@shared/modules/customer/customers/services/CustomerService";
import {
  resolveBranchFilter,
  ownedRowMatchesFilter,
} from "@shared/shared/lib/branchFilter";
import { QuotaExceededError } from "@shared/modules/admin/billing/utils/quotaError";
import { activeLines } from "@shared/modules/customer/customer-plans/utils/activeLines";
import type { GlobalState } from "@shared/state/globalStore";

export interface CustomerSlice {
  items: Customer[];
  activeCount: number;
  page: number;
  hasMore: boolean;
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
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
    addingLines: number,
  ) => Promise<Customer | null>;
  updateCustomer: (id: string, data: CustomerInput) => Promise<Customer | null>;
  setCustomerLines: (id: string, lines: CustomerPlan[]) => void;
  deactivateCustomer: (customer: Customer) => Promise<Customer | null>;
  reactivateCustomer: (customer: Customer) => Promise<Customer | null>;
  deleteCustomer: (customer: Customer) => Promise<"hard" | "soft" | null>;
  bulkDeleteCustomers: (customers: Customer[]) => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

export const createCustomerSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  CustomerSlice
> = (set, get) => ({
  items: [],
  activeCount: 0,
  page: 0,
  hasMore: true,
  loaded: false,
  loading: false,
  loadingMore: false,
  error: null,
  searchQuery: "",
  searchToken: 0,

  getCustomers: async () => {
    const { loaded, loading } = get().customers;
    if (loaded || loading) return;
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
      const { customers, hasMore, activeCount } =
        await customerService.getCustomers(0, query, branchFilter);
      if (get().customers.searchToken !== token) return;
      set((state) => {
        state.customers.items = customers;
        state.customers.hasMore = hasMore;
        state.customers.activeCount = activeCount;
        state.customers.page = 0;
        state.customers.loaded = true;
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
    const { loading, loadingMore, hasMore, page, searchToken, searchQuery } =
      get().customers;
    if (loading || loadingMore || !hasMore) return;
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

  // Both caps are tenant-wide, so they read billing — this slice's own
  // activeCount is branch-filtered and would under-count for a branch admin.
  // The drafted lines are counted here too, before the customer row is written.
  createCustomer: async (data, tenantId, addingLines) => {
    const branchFilter = resolveBranchFilter(get().auth.user);
    const { limits, active } = get().billing;
    get().billing.clearQuotaError();
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const customer = await customerService.createCustomer(
        data,
        tenantId,
        limits,
        active,
        addingLines,
      );
      set((state) => {
        state.customers.items.unshift(customer);
        if (ownedRowMatchesFilter(customer.branchId, branchFilter))
          state.customers.activeCount += 1;
        state.customers.loading = false;
      });
      get().billing.bumpActive({ customers: 1 });
      return customer;
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        get().billing.setQuotaError(e);
        set((state) => {
          state.customers.loading = false;
        });
      } else {
        set((state) => {
          state.customers.error = (e as Error).message;
          state.customers.loading = false;
        });
      }
      return null;
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
      return updated;
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
      return null;
    }
  },

  setCustomerLines: (id, lines) =>
    set((state) => {
      const i = state.customers.items.findIndex((c) => c.id === id);
      if (i !== -1) state.customers.items[i].customerPlans = lines;
    }),

  // Its lines stay, but stop counting against the plan allowance while inactive.
  deactivateCustomer: async (customer) => {
    const { id } = customer;
    const wasActive = customer.active;
    const lines = activeLines(customer).length;
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const updated = await customerService.deactivateCustomer(id);
      set((state) => {
        const i = state.customers.items.findIndex((c) => c.id === id);
        if (i !== -1) state.customers.items[i] = updated;
        if (wasActive)
          state.customers.activeCount = Math.max(
            0,
            state.customers.activeCount - 1,
          );
        state.customers.loading = false;
      });
      if (wasActive) get().billing.bumpActive({ customers: -1, plans: -lines });
      return updated;
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
      return null;
    }
  },

  reactivateCustomer: async (customer) => {
    const { id } = customer;
    const wasActive = customer.active;
    const lines = activeLines(customer).length;
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const updated = await customerService.reactivateCustomer(id);
      set((state) => {
        const i = state.customers.items.findIndex((c) => c.id === id);
        if (i !== -1) state.customers.items[i] = updated;
        if (!wasActive) state.customers.activeCount += 1;
        state.customers.loading = false;
      });
      if (!wasActive) get().billing.bumpActive({ customers: 1, plans: lines });
      return updated;
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
      return null;
    }
  },

  deleteCustomer: async (customer) => {
    const { id } = customer;
    const wasActive = customer.active;
    const lines = activeLines(customer).length;
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const result = await customerService.deleteCustomer(id);
      if (result.mode === "hard") {
        set((state) => {
          state.customers.items = state.customers.items.filter(
            (c) => c.id !== id,
          );
          if (wasActive)
            state.customers.activeCount = Math.max(
              0,
              state.customers.activeCount - 1,
            );
          state.customers.loading = false;
        });
      } else {
        set((state) => {
          const i = state.customers.items.findIndex((c) => c.id === id);
          if (i !== -1) state.customers.items[i] = result.customer;
          if (wasActive)
            state.customers.activeCount = Math.max(
              0,
              state.customers.activeCount - 1,
            );
          state.customers.loading = false;
        });
      }
      if (wasActive) get().billing.bumpActive({ customers: -1, plans: -lines });
      return result.mode;
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
      return null;
    }
  },

  bulkDeleteCustomers: async (customers) => {
    if (customers.length === 0) return true;
    const ids = customers.map((c) => c.id);
    const removedActive = customers.filter((c) => c.active);
    const activeRemoved = removedActive.length;
    const linesRemoved = removedActive.reduce(
      (sum, c) => sum + activeLines(c).length,
      0,
    );
    set((state) => {
      state.customers.loading = true;
      state.customers.error = null;
    });
    try {
      const { hard, soft } = await customerService.deleteManyCustomers(ids);
      set((state) => {
        const removed = new Set(hard);
        const softened = new Set(soft);
        state.customers.items = state.customers.items.filter(
          (c) => !removed.has(c.id),
        );
        for (const c of state.customers.items) {
          if (softened.has(c.id)) {
            c.active = false;
            c.cancelledAt = new Date().toISOString();
          }
        }
        state.customers.activeCount = Math.max(
          0,
          state.customers.activeCount - activeRemoved,
        );
        state.customers.loading = false;
      });
      if (activeRemoved)
        get().billing.bumpActive({
          customers: -activeRemoved,
          plans: -linesRemoved,
        });
      return true;
    } catch (e) {
      set((state) => {
        state.customers.error = (e as Error).message;
        state.customers.loading = false;
      });
      return false;
    }
  },

  clearError: () =>
    set((state) => {
      state.customers.error = null;
    }),
  reset: () =>
    set((state) => {
      state.customers.items = [];
      state.customers.loaded = false;
      state.customers.activeCount = 0;
      state.customers.page = 0;
      state.customers.hasMore = true;
      state.customers.searchQuery = "";
      state.customers.searchToken += 1;
    }),
});
