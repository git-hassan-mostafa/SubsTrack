import { create } from "zustand";
import type { Customer } from "@/src/core/types";
import { CustomerService } from "../services/CustomerService";

interface CustomerInput {
  name: string;
  phoneNumber: string | null;
  address: string | null;
  planId: string | null;
  startDate: string;
}

interface CustomersState {
  customers: Customer[];
  totalCount: number;
  page: number;
  hasMore: boolean;
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
  createCustomer: (data: CustomerInput, tenantId: string) => Promise<void>;
  updateCustomer: (
    id: string,
    data: CustomerInput,
  ) => Promise<void>;
  deactivateCustomer: (id: string) => Promise<void>;
  reactivateCustomer: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const customerService = new CustomerService();

export const useCustomerStore = create<CustomersState>((set, get) => ({
  customers: [],
  totalCount: 0,
  page: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  error: null,
  searchQuery: "",
  searchToken: 0,
  getCustomers: async () => {
    if (!!get().customers && get().customers.length > 0) return;
    await get().fetchCustomers();
  },
  fetchCustomers: async () => {
    const token = get().searchToken;
    const query = get().searchQuery;
    set({ loading: true, error: null, page: 0 });
    try {
      const { customers, hasMore, totalCount } = await customerService.getCustomers(0, query);
      if (get().searchToken !== token) return;
      set({ customers, hasMore, totalCount, page: 0, loading: false });
    } catch (e) {
      if (get().searchToken !== token) return;
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchMoreCustomers: async () => {
    const { loadingMore, hasMore, page, searchToken, searchQuery } = get();
    if (loadingMore || !hasMore) return;
    const token = searchToken;
    set({ loadingMore: true });
    try {
      const nextPage = page + 1;
      const { customers, hasMore: more } = await customerService.getCustomers(
        nextPage,
        searchQuery,
      );
      if (get().searchToken !== token) {
        set({ loadingMore: false });
        return;
      }
      set((state) => ({
        customers: [...state.customers, ...customers],
        hasMore: more,
        page: nextPage,
        loadingMore: false,
      }));
    } catch (e) {
      if (get().searchToken !== token) {
        set({ loadingMore: false });
        return;
      }
      set({ error: (e as Error).message, loadingMore: false });
    }
  },

  setSearchQuery: async (q) => {
    const trimmed = q.trim();
    if (trimmed === get().searchQuery) return;
    set((s) => ({
      searchQuery: trimmed,
      searchToken: s.searchToken + 1,
      page: 0,
      customers: [],
      hasMore: true,
    }));
    await get().fetchCustomers();
  },
  getCustomer: async (id) => {
    const { customers } = get();
    const customer = customers.find((c) => c.id === id);
    if (customer) return customer;
    return await get().fetchCustomer(id);
  },
  fetchCustomer: async (id) => {
    set({ loading: true, error: null });
    try {
      const customer = await customerService.getCustomer(id);
      set((state) => {
        const exists = state.customers.some((c) => c.id === id);
        return {
          customers: exists
            ? state.customers.map((c) => (c.id === id ? customer : c))
            : [...state.customers, customer],
          loading: false,
        };
      });
      return customer;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return null;
    }
  },

  createCustomer: async (data, tenantId) => {
    set({ loading: true, error: null });
    try {
      const customer = await customerService.createCustomer(data, tenantId);
      set((state) => ({
        customers: [customer, ...state.customers],
        totalCount: state.totalCount + 1,
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateCustomer: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await customerService.updateCustomer(id, data);
      set((state) => ({
        customers: state.customers.map((c) => (c.id === id ? updated : c)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deactivateCustomer: async (id) => {
    set({ loading: true, error: null });
    try {
      const updated = await customerService.deactivateCustomer(id);
      set((state) => ({
        customers: state.customers.map((c) => (c.id === id ? updated : c)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  reactivateCustomer: async (id) => {
    set({ loading: true, error: null });
    try {
      const updated = await customerService.reactivateCustomer(id);
      set((state) => ({
        customers: state.customers.map((c) => (c.id === id ? updated : c)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  reset: () =>
    set((s) => ({
      customers: [],
      totalCount: 0,
      page: 0,
      hasMore: true,
      searchQuery: "",
      searchToken: s.searchToken + 1,
    })),
}));
