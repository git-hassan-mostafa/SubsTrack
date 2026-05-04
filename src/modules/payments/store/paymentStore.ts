import { create } from 'zustand';
import type { Customer, MonthEntry, Payment } from '@/src/core/types';
import { PaymentService } from '../services/PaymentService';

interface CreatePaymentInput {
  billingMonth: string;
  amount: number;
  customerId: string;
  planId: string | null;
  receivedByUserId: string | null;
  tenantId: string;
}

interface PaymentsState {
  payments: Payment[];
  monthGrid: MonthEntry[];
  loading: boolean;
  loadingCreate: boolean;
  loadingVoid: boolean;
  error: string | null;
  fetchPayments: (customerId: string, year: number, customer: Customer, graceDays: number) => Promise<void>;
  createPayment: (data: CreatePaymentInput, customer: Customer, graceDays: number) => Promise<void>;
  voidPayment: (id: string, voidedBy: string, notes: string, customer: Customer, year: number, graceDays: number) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const paymentService = new PaymentService();

export const usePaymentStore = create<PaymentsState>((set, get) => ({
  payments: [],
  monthGrid: [],
  loading: false,
  loadingCreate: false,
  loadingVoid: false,
  error: null,

  fetchPayments: async (customerId, year, customer, graceDays) => {
    set({ loading: true, error: null });
    try {
      const payments = await paymentService.getPaymentsForYear(customerId, year);
      const monthGrid = paymentService.buildMonthGrid(customer, payments, year, graceDays);
      set({ payments, monthGrid, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createPayment: async (data, customer, graceDays) => {
    if (get().loadingCreate) return; // in-flight guard
    set({ loadingCreate: true, error: null });
    try {
      const payment = await paymentService.createPayment(data);
      const { year } = (() => {
        const [y] = data.billingMonth.split('-').map(Number);
        return { year: y };
      })();
      const payments = [...get().payments, payment];
      const monthGrid = paymentService.buildMonthGrid(customer, payments, year, graceDays);
      set({ payments, monthGrid, loadingCreate: false });
    } catch (e) {
      set({ error: (e as Error).message, loadingCreate: false });
    }
  },

  voidPayment: async (id, voidedBy, notes, customer, year, graceDays) => {
    if (get().loadingVoid) return;
    set({ loadingVoid: true, error: null });
    try {
      await paymentService.voidPayment(id, voidedBy, notes);
      // Remove voided payment from local list and rebuild grid
      const payments = get().payments.filter((p) => p.id !== id);
      const monthGrid = paymentService.buildMonthGrid(customer, payments, year, graceDays);
      set({ payments, monthGrid, loadingVoid: false });
    } catch (e) {
      set({ error: (e as Error).message, loadingVoid: false });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ payments: [], monthGrid: [], loading: false, loadingCreate: false, loadingVoid: false, error: null }),
}));
