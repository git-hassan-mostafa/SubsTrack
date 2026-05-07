import { create } from 'zustand';
import type { Customer } from '@/src/core/types';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import { PaymentRepository } from '@/src/modules/payments/repository/PaymentRepository';
import { CustomerService } from '../services/CustomerService';

interface CreateInput {
  name: string;
  phoneNumber: string | null;
  address: string | null;
  planId: string | null;
  startDate: string;
}

interface CustomersState {
  customers: Customer[];
  currentMonthPaidIds: Set<string>;
  selectedCustomer: Customer | null;
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  fetchCustomers: () => Promise<void>;
  fetchMoreCustomers: () => Promise<void>;
  fetchCustomer: (id: string) => Promise<void>;
  createCustomer: (data: CreateInput, tenantId: string) => Promise<void>;
  updateCustomer: (id: string, data: Omit<CreateInput, 'startDate'>) => Promise<void>;
  deactivateCustomer: (id: string) => Promise<void>;
  reactivateCustomer: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const customerService = new CustomerService();
const paymentRepository = new PaymentRepository();

export const useCustomerStore = create<CustomersState>((set, get) => ({
  customers: [],
  currentMonthPaidIds: new Set(),
  selectedCustomer: null,
  page: 0,
  hasMore: true,
  loading: false,
  loadingMore: false,
  error: null,

  fetchCustomers: async () => {
    set({ loading: true, error: null, page: 0 });
    try {
      const { year, month } = getCurrentYearMonth();
      const billingMonth = toBillingMonth(year, month);
      const [{ customers, hasMore }, currentMonthPaidIds] = await Promise.all([
        customerService.getCustomers(0),
        paymentRepository.findPaidCustomerIdsForMonth(billingMonth),
      ]);
      set({ customers, hasMore, page: 0, currentMonthPaidIds, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchMoreCustomers: async () => {
    const { loadingMore, hasMore, page } = get();
    if (loadingMore || !hasMore) return;
    set({ loadingMore: true });
    try {
      const nextPage = page + 1;
      const { customers, hasMore: more } = await customerService.getCustomers(nextPage);
      set((state) => ({
        customers: [...state.customers, ...customers],
        hasMore: more,
        page: nextPage,
        loadingMore: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loadingMore: false });
    }
  },

  fetchCustomer: async (id) => {
    set({ loading: true, error: null, selectedCustomer: null });
    try {
      const selectedCustomer = await customerService.getCustomer(id);
      set({ selectedCustomer, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createCustomer: async (data, tenantId) => {
    set({ loading: true, error: null });
    try {
      const customer = await customerService.createCustomer(data, tenantId);
      set((state) => ({ customers: [customer, ...state.customers], loading: false }));
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
        selectedCustomer: state.selectedCustomer?.id === id ? updated : state.selectedCustomer,
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
        selectedCustomer: state.selectedCustomer?.id === id ? updated : state.selectedCustomer,
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
        selectedCustomer: state.selectedCustomer?.id === id ? updated : state.selectedCustomer,
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set({ customers: [], currentMonthPaidIds: new Set(), selectedCustomer: null, page: 0, hasMore: true }),
}));
