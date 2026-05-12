import { create } from "zustand";
import type { Customer, MonthEntry, Payment } from "@/src/core/types";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { PaymentService } from "../services/PaymentService";

interface CreatePaymentInput {
  billingMonth: string;
  amount: number;
  customerId: string;
  planId: string | null;
  receivedByUserId: string | null;
  tenantId: string;
  notes: string | null;
}

interface PaymentsState {
  payments: Payment[];
  monthGrid: MonthEntry[];
  currentMonthPaidIds: Set<string>;
  loading: boolean;
  loadingCreate: boolean;
  loadingVoid: boolean;
  loadingUpdate: boolean;
  error: string | null;
  fetchCurrentMonthPaidIds: () => Promise<void>;
  fetchPayments: (
    customerId: string,
    year: number,
    customer: Customer,
    graceDays: number,
  ) => Promise<void>;
  createPayment: (
    data: CreatePaymentInput,
    customer: Customer,
    graceDays: number,
  ) => Promise<void>;
  updatePaymentAmount: (
    id: string,
    amount: number,
    customer: Customer,
    year: number,
    graceDays: number,
  ) => Promise<void>;
  voidPayment: (
    id: string,
    voidedBy: string,
    notes: string,
    customer: Customer,
    year: number,
    graceDays: number,
  ) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const paymentService = new PaymentService();

export const usePaymentStore = create<PaymentsState>((set, get) => ({
  payments: [],
  monthGrid: [],
  currentMonthPaidIds: new Set(),
  loading: false,
  loadingCreate: false,
  loadingVoid: false,
  loadingUpdate: false,
  error: null,

  fetchCurrentMonthPaidIds: async () => {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    const ids = await paymentService.findPaidCustomerIdsForMonth(billingMonth);
    set({ currentMonthPaidIds: ids });
  },

  fetchPayments: async (customerId, year, customer, graceDays) => {
    set({ loading: true, error: null });
    try {
      const payments = await paymentService.getPaymentsForYear(
        customerId,
        year,
      );
      const monthGrid = paymentService.buildMonthGrid(
        customer,
        payments,
        year,
        graceDays,
      );
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
        const [y] = data.billingMonth.split("-").map(Number);
        return { year: y };
      })();
      const payments = [...get().payments, payment];
      const monthGrid = paymentService.buildMonthGrid(
        customer,
        payments,
        year,
        graceDays,
      );
      set((state) => ({
        payments,
        monthGrid,
        loadingCreate: false,
        currentMonthPaidIds: new Set([
          ...state.currentMonthPaidIds,
          data.customerId,
        ]),
      }));
    } catch (e) {
      set({ error: (e as Error).message, loadingCreate: false });
    }
  },

  updatePaymentAmount: async (id, amount, customer, year, graceDays) => {
    if (get().loadingUpdate) return;
    set({ loadingUpdate: true, error: null });
    try {
      const updated = await paymentService.updatePaymentAmount(id, amount);
      const payments = get().payments.map((p) => (p.id === id ? updated : p));
      const monthGrid = paymentService.buildMonthGrid(
        customer,
        payments,
        year,
        graceDays,
      );
      set({ payments, monthGrid, loadingUpdate: false });
    } catch (e) {
      set({ error: (e as Error).message, loadingUpdate: false });
    }
  },

  voidPayment: async (id, voidedBy, notes, customer, year, graceDays) => {
    if (get().loadingVoid) return;
    const paymentToVoid = get().payments.find((p) => p.id === id);
    set({ loadingVoid: true, error: null });
    try {
      await paymentService.voidPayment(id, voidedBy, notes);
      const payments = get().payments.filter((p) => p.id !== id);
      const monthGrid = paymentService.buildMonthGrid(
        customer,
        payments,
        year,
        graceDays,
      );
      const { year: cy, month: cm } = getCurrentYearMonth();
      const isCurrentMonth =
        paymentToVoid?.billingMonth === toBillingMonth(cy, cm);
      set((state) => ({
        payments,
        monthGrid,
        loadingVoid: false,
        currentMonthPaidIds: isCurrentMonth
          ? new Set(
              [...state.currentMonthPaidIds].filter(
                (pid) => pid !== customer.id,
              ),
            )
          : state.currentMonthPaidIds,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loadingVoid: false });
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      payments: [],
      monthGrid: [],
      currentMonthPaidIds: new Set(),
      loading: false,
      loadingCreate: false,
      loadingVoid: false,
      loadingUpdate: false,
      error: null,
    }),
}));
