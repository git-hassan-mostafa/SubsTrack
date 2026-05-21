import { create } from "zustand";
import type { Currency, Customer, MonthEntry, Payment, Plan } from "@/src/core/types";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import { PaymentService, type MultiMonthConflict } from "../services/PaymentService";

// USD payments (currency === null) snapshot at rate 1. Otherwise, freeze the live rate.
const snapshotRate = (currency: Currency | null): number =>
  currency?.ratePerUsd ?? 1;


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

  createPayment: async (data, currency, customer, graceDays) => {
    if (get().loadingCreate) return;
    set({ loadingCreate: true, error: null });
    try {
      const payment = await paymentService.createPayment({
        ...data,
        ratePerUsdSnapshot: snapshotRate(currency),
      });
      const [year] = data.billingMonth.split("-").map(Number);
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
        currentMonthPaidIds: payment.amountPaid > 0
          ? new Set([...state.currentMonthPaidIds, data.customerId])
          : state.currentMonthPaidIds,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loadingCreate: false });
    }
  },

  createMultiMonthPayment: async (
    startMonth,
    customer,
    plan,
    planCurrency,
    amountPaid,
    receivedByUserId,
    notes,
    tenantId,
    skipConflicts,
    year,
    graceDays,
  ) => {
    if (get().loadingCreate) return [];
    set({ loadingCreate: true, error: null });
    try {
      const { payment, skippedMonths } = await paymentService.createMultiMonthPayment(
        startMonth,
        customer,
        plan,
        amountPaid,
        receivedByUserId,
        notes,
        tenantId,
        get().payments,
        skipConflicts,
        snapshotRate(planCurrency),
      );
      const payments = [...get().payments, payment];
      const monthGrid = paymentService.buildMonthGrid(customer, payments, year, graceDays);
      const { year: cy, month: cm } = getCurrentYearMonth();
      const currentBillingMonth = toBillingMonth(cy, cm);
      // Check if the new payment covers the current month.
      const [pYear, pMonthNum] = payment.billingMonth.split("-").map(Number);
      let coversCurrentMonth = false;
      for (let d = 0; d < payment.durationMonths; d++) {
        const date = new Date(pYear, pMonthNum - 1 + d, 1);
        if (toBillingMonth(date.getFullYear(), date.getMonth() + 1) === currentBillingMonth) {
          coversCurrentMonth = true;
          break;
        }
      }
      set((state) => ({
        payments,
        monthGrid,
        loadingCreate: false,
        currentMonthPaidIds: coversCurrentMonth && payment.amountPaid > 0
          ? new Set([...state.currentMonthPaidIds, customer.id])
          : state.currentMonthPaidIds,
      }));
      return skippedMonths;
    } catch (e) {
      set({ error: (e as Error).message, loadingCreate: false });
      return [];
    }
  },

  updatePayment: async (id, amountDue, amountPaid, currency, customer, year, graceDays) => {
    if (get().loadingUpdate) return;
    const existing = get().payments.find((p) => p.id === id);
    if (!existing) return;
    set({ loadingUpdate: true, error: null });
    try {
      const updated = await paymentService.updatePayment(id, amountDue, amountPaid, currency);
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
      const currentBillingMonth = toBillingMonth(cy, cm);
      // Check if the voided payment covered the current month.
      let voideCurrentMonth = false;
      if (paymentToVoid) {
        const [pYear, pMonthNum] = paymentToVoid.billingMonth.split("-").map(Number);
        for (let d = 0; d < paymentToVoid.durationMonths; d++) {
          const date = new Date(pYear, pMonthNum - 1 + d, 1);
          if (toBillingMonth(date.getFullYear(), date.getMonth() + 1) === currentBillingMonth) {
            voideCurrentMonth = true;
            break;
          }
        }
      }
      set((state) => ({
        payments,
        monthGrid,
        loadingVoid: false,
        currentMonthPaidIds: voideCurrentMonth
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
      loading: false,
      loadingCreate: false,
      loadingVoid: false,
      loadingUpdate: false,
      error: null,
    }),
}));


interface CreatePaymentInput {
  billingMonth: string;
  amountDue: number;
  amountPaid: number;
  durationMonths: number;
  currencyId: string | null;
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
    currency: Currency | null,
    customer: Customer,
    graceDays: number,
  ) => Promise<void>;
  createMultiMonthPayment: (
    startMonth: string,
    customer: Customer,
    plan: Plan,
    planCurrency: Currency | null,
    amountPaid: number,
    receivedByUserId: string,
    notes: string | null,
    tenantId: string,
    skipConflicts: boolean,
    year: number,
    graceDays: number,
  ) => Promise<MultiMonthConflict[]>;
  updatePayment: (
    id: string,
    amountDue: number,
    amountPaid: number,
    currency: Currency | null,
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