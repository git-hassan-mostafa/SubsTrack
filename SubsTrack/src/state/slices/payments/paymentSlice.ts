import type { StateCreator } from 'zustand';
import type { Currency, Customer, MonthEntry, Payment, Plan, TierPlan } from '@/src/core/types';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import { PaymentService, type MultiMonthConflict } from '@/src/modules/customer-payments/services/PaymentService';
import { TierLimitError } from '@/src/modules/subscription/services/TierService';
import type { TierLimitErrorPayload } from '@/src/modules/subscription/components/UpgradePromptModal';
import type { GlobalState } from '@/src/state/globalStore';

const snapshotRate = (currency: Currency | null): number => currency?.ratePerUsd ?? 1;

const paymentService = new PaymentService();

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

export interface PaymentSlice {
  items: Payment[];
  monthGrid: MonthEntry[];
  currentMonthPaidIds: Set<string>;
  loading: boolean;
  loadingCreate: boolean;
  loadingVoid: boolean;
  loadingUpdate: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
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
    tier: TierPlan,
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
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createPaymentSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  PaymentSlice
> = (set, get) => ({
  items: [],
  monthGrid: [],
  currentMonthPaidIds: new Set(),
  loading: false,
  loadingCreate: false,
  loadingVoid: false,
  loadingUpdate: false,
  error: null,
  tierLimitError: null,

  fetchCurrentMonthPaidIds: async () => {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    const ids = await paymentService.findPaidCustomerIdsForMonth(billingMonth);
    set((state) => {
      state.payments.currentMonthPaidIds = ids;
    });
  },

  fetchPayments: async (customerId, year, customer, graceDays) => {
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
    });
    try {
      const items = await paymentService.getPaymentsForYear(customerId, year);
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loading = false;
      });
    }
  },

  createPayment: async (data, currency, customer, graceDays) => {
    if (get().payments.loadingCreate) return;
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
    });
    try {
      const payment = await paymentService.createPayment({
        ...data,
        ratePerUsdSnapshot: snapshotRate(currency),
      });
      const [year] = data.billingMonth.split('-').map(Number);
      const items = [...get().payments.items, payment];
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingCreate = false;
        if (payment.amountPaid > 0) {
          state.payments.currentMonthPaidIds = new Set([
            ...state.payments.currentMonthPaidIds,
            data.customerId,
          ]);
        }
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingCreate = false;
      });
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
    tier,
  ) => {
    if (get().payments.loadingCreate) return [];
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    });
    try {
      const { payment, skippedMonths } = await paymentService.createMultiMonthPayment(
        startMonth,
        customer,
        plan,
        amountPaid,
        receivedByUserId,
        notes,
        tenantId,
        get().payments.items,
        skipConflicts,
        snapshotRate(planCurrency),
        tier,
      );
      const items = [...get().payments.items, payment];
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      const { year: cy, month: cm } = getCurrentYearMonth();
      const currentBillingMonth = toBillingMonth(cy, cm);
      const [pYear, pMonthNum] = payment.billingMonth.split('-').map(Number);
      let coversCurrentMonth = false;
      for (let d = 0; d < payment.durationMonths; d++) {
        const date = new Date(pYear, pMonthNum - 1 + d, 1);
        if (toBillingMonth(date.getFullYear(), date.getMonth() + 1) === currentBillingMonth) {
          coversCurrentMonth = true;
          break;
        }
      }
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingCreate = false;
        if (coversCurrentMonth && payment.amountPaid > 0) {
          state.payments.currentMonthPaidIds = new Set([
            ...state.payments.currentMonthPaidIds,
            customer.id,
          ]);
        }
      });
      return skippedMonths;
    } catch (e) {
      if (e instanceof TierLimitError) {
        set((state) => {
          state.payments.tierLimitError = {
            resource: e.resource,
            limit: e.limit,
            tierCode: e.tierCode,
          };
          state.payments.loadingCreate = false;
        });
      } else {
        set((state) => {
          state.payments.error = (e as Error).message;
          state.payments.loadingCreate = false;
        });
      }
      return [];
    }
  },

  updatePayment: async (id, amountDue, amountPaid, currency, customer, year, graceDays) => {
    if (get().payments.loadingUpdate) return;
    const existing = get().payments.items.find((p) => p.id === id);
    if (!existing) return;
    set((state) => {
      state.payments.loadingUpdate = true;
      state.payments.error = null;
    });
    try {
      const updated = await paymentService.updatePayment(id, amountDue, amountPaid, currency);
      const items = get().payments.items.map((p) => (p.id === id ? updated : p));
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingUpdate = false;
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingUpdate = false;
      });
    }
  },

  voidPayment: async (id, voidedBy, notes, customer, year, graceDays) => {
    if (get().payments.loadingVoid) return;
    const paymentToVoid = get().payments.items.find((p) => p.id === id);
    set((state) => {
      state.payments.loadingVoid = true;
      state.payments.error = null;
    });
    try {
      await paymentService.voidPayment(id, voidedBy, notes);
      const items = get().payments.items.filter((p) => p.id !== id);
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      const { year: cy, month: cm } = getCurrentYearMonth();
      const currentBillingMonth = toBillingMonth(cy, cm);
      let voidedCurrentMonth = false;
      if (paymentToVoid) {
        const [pYear, pMonthNum] = paymentToVoid.billingMonth.split('-').map(Number);
        for (let d = 0; d < paymentToVoid.durationMonths; d++) {
          const date = new Date(pYear, pMonthNum - 1 + d, 1);
          if (toBillingMonth(date.getFullYear(), date.getMonth() + 1) === currentBillingMonth) {
            voidedCurrentMonth = true;
            break;
          }
        }
      }
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingVoid = false;
        if (voidedCurrentMonth) {
          state.payments.currentMonthPaidIds = new Set(
            [...state.payments.currentMonthPaidIds].filter((pid) => pid !== customer.id),
          );
        }
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingVoid = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.payments.error = null;
    }),
  clearTierLimitError: () =>
    set((state) => {
      state.payments.tierLimitError = null;
    }),
  reset: () =>
    set((state) => {
      state.payments.items = [];
      state.payments.monthGrid = [];
      state.payments.loading = false;
      state.payments.loadingCreate = false;
      state.payments.loadingVoid = false;
      state.payments.loadingUpdate = false;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    }),
});
