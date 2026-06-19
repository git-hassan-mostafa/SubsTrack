import type { StateCreator } from 'zustand';
import type { Currency, Customer, MonthEntry, Payment, Plan, TierPlan } from '@/src/core/types';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import { paymentService, type MultiMonthConflict } from '@/src/modules/customer-payments';
import { TierLimitError } from '@/src/modules/subscription';
import type { TierLimitErrorPayload } from '@/src/modules/subscription';
import type { GlobalState } from '@/src/state/globalStore';

const snapshotRate = (currency: Currency | null): number => currency?.ratePerUsd ?? 1;

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

// One eligible fixed-price customer in a customer-list bulk quick pay. The slice
// derives the frozen rate from `currency` and pays the current month.
export interface BulkPayCustomerRequest {
  customer: Customer;
  plan: Plan;
  currency: Currency | null;
  amountPaid: number;
}

export interface PaymentSlice {
  items: Payment[];
  monthGrid: MonthEntry[];
  // Customers fully settled for the current month (payment exists, balance == 0).
  currentMonthFullyPaidIds: Set<string>;
  // Customers with a payment for the current month that still has outstanding balance.
  currentMonthPartialIds: Set<string>;
  // Active regular customers with any unpaid month up to now (even if the current
  // month is paid). Drives the "unpaid" status on the customer list.
  overdueCustomerIds: Set<string>;
  loading: boolean;
  loadingCreate: boolean;
  loadingVoid: boolean;
  loadingUpdate: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  fetchCurrentMonthPaymentStatus: () => Promise<void>;
  // Recomputes the overdue set for the given (loaded) customers.
  fetchOverdueStatus: (customers: Customer[], graceDays: number) => Promise<void>;
  // Loads all of a customer's payments only when they aren't already in the
  // store, then builds the requested year's grid. Mirrors customers.getCustomers.
  getPayments: (
    customerId: string,
    year: number,
    customer: Customer,
    graceDays: number,
  ) => Promise<void>;
  // Fetches all of a customer's payments (every year) and builds the year's grid.
  fetchPayments: (
    customerId: string,
    year: number,
    customer: Customer,
    graceDays: number,
  ) => Promise<void>;
  // Rebuilds the viewed year's grid from payments already in the store — used
  // when navigating years, so no re-fetch is needed.
  buildGrid: (customer: Customer, year: number, graceDays: number) => void;
  createPayment: (
    data: CreatePaymentInput,
    currency: Currency | null,
    customer: Customer,
    graceDays: number,
  ) => Promise<void>;
  // Bulk single-month create (month-grid bulk pay) — all inputs share one
  // currency and belong to `year`. One DB round-trip, one grid rebuild.
  createPayments: (
    data: CreatePaymentInput[],
    currency: Currency | null,
    customer: Customer,
    year: number,
    graceDays: number,
  ) => Promise<void>;
  // Customer-list bulk quick pay: pays the current month for many DIFFERENT
  // fixed-price customers (single AND multi-month) in one DB round-trip, then
  // syncs the current-month status badges. All-or-nothing — returns the number
  // paid (0 on failure; check `error`/`tierLimitError`).
  bulkPayCustomers: (
    requests: BulkPayCustomerRequest[],
    receivedByUserId: string,
    tenantId: string,
    tier: TierPlan,
  ) => Promise<number>;
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
  // Bulk multi-month create (month-grid bulk pay): one full-price block payment
  // per start month, in one DB round-trip. Always skips already-covered months.
  createMultiMonthPayments: (
    starts: string[],
    customer: Customer,
    plan: Plan,
    planCurrency: Currency | null,
    amountPaid: number,
    receivedByUserId: string,
    notes: string | null,
    tenantId: string,
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
  // Bulk void (month-grid bulk void) — one DB round-trip, one grid rebuild.
  voidPayments: (
    ids: string[],
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
  currentMonthFullyPaidIds: new Set(),
  currentMonthPartialIds: new Set(),
  overdueCustomerIds: new Set(),
  loading: false,
  loadingCreate: false,
  loadingVoid: false,
  loadingUpdate: false,
  error: null,
  tierLimitError: null,

  fetchCurrentMonthPaymentStatus: async () => {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    const { fullyPaidIds, partialIds } = await paymentService.findPaymentStatusForMonth(billingMonth);
    set((state) => {
      state.payments.currentMonthFullyPaidIds = fullyPaidIds;
      state.payments.currentMonthPartialIds = partialIds;
    });
  },

  fetchOverdueStatus: async (customers, graceDays) => {
    const overdueCustomerIds = await paymentService.findOverdueCustomerIds(
      customers,
      graceDays,
    );
    set((state) => {
      state.payments.overdueCustomerIds = overdueCustomerIds;
    });
  },

  getPayments: async (customerId, year, customer, graceDays) => {
    const items = get().payments.items;
    if (items.length > 0 && items[0].customerId === customerId) {
      get().payments.buildGrid(customer, year, graceDays);
      return;
    }
    await get().payments.fetchPayments(customerId, year, customer, graceDays);
  },

  fetchPayments: async (customerId, year, customer, graceDays) => {
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
    });
    try {
      const items = await paymentService.getPaymentsForCustomer(customerId);
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

  buildGrid: (customer, year, graceDays) => {
    const monthGrid = paymentService.buildMonthGrid(
      customer,
      get().payments.items,
      year,
      graceDays,
    );
    set((state) => {
      state.payments.monthGrid = monthGrid;
    });
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
      const { year: cy, month: cm } = getCurrentYearMonth();
      const isCurrentMonth = data.billingMonth === toBillingMonth(cy, cm);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingCreate = false;
        if (isCurrentMonth && payment.amountPaid > 0) {
          applyPaymentStatus(state.payments, data.customerId, payment.balance > 0);
        }
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingCreate = false;
      });
    }
  },

  createPayments: async (data, currency, customer, year, graceDays) => {
    if (data.length === 0 || get().payments.loadingCreate) return;
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
    });
    try {
      const rate = snapshotRate(currency);
      const created = await paymentService.createPayments(
        data.map((d) => ({ ...d, ratePerUsdSnapshot: rate })),
      );
      const items = [...get().payments.items, ...created];
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      const { year: cy, month: cm } = getCurrentYearMonth();
      const currentBillingMonth = toBillingMonth(cy, cm);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingCreate = false;
        for (const payment of created) {
          if (payment.billingMonth === currentBillingMonth && payment.amountPaid > 0) {
            applyPaymentStatus(state.payments, customer.id, payment.balance > 0);
          }
        }
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingCreate = false;
      });
    }
  },

  bulkPayCustomers: async (requests, receivedByUserId, tenantId, tier) => {
    if (requests.length === 0 || get().payments.loadingCreate) return 0;
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    });
    try {
      const { year, month } = getCurrentYearMonth();
      const billingMonth = toBillingMonth(year, month);
      const created = await paymentService.bulkPayCustomers(
        requests.map((r) => ({
          customer: r.customer,
          plan: r.plan,
          billingMonth,
          amountPaid: r.amountPaid,
          ratePerUsdSnapshot: snapshotRate(r.currency),
        })),
        receivedByUserId,
        tenantId,
        tier,
      );
      set((state) => {
        state.payments.loading = false;
        // Every block starts at the current month, so all paid customers settle
        // the badge for this month. Keep the list in sync without a re-fetch.
        for (const payment of created) {
          if (payment.amountPaid > 0) {
            applyPaymentStatus(state.payments, payment.customerId, payment.balance > 0);
          }
        }
      });
      return created.length;
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
      return 0;
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
          applyPaymentStatus(state.payments, customer.id, payment.balance > 0);
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

  createMultiMonthPayments: async (
    starts,
    customer,
    plan,
    planCurrency,
    amountPaid,
    receivedByUserId,
    notes,
    tenantId,
    year,
    graceDays,
    tier,
  ) => {
    if (starts.length === 0 || get().payments.loadingCreate) return [];
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    });
    try {
      const { payments, skippedMonths } = await paymentService.createMultiMonthPayments(
        starts,
        customer,
        plan,
        amountPaid,
        receivedByUserId,
        notes,
        tenantId,
        get().payments.items,
        snapshotRate(planCurrency),
        tier,
      );
      const items = [...get().payments.items, ...payments];
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      const { year: cy, month: cm } = getCurrentYearMonth();
      const currentBillingMonth = toBillingMonth(cy, cm);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingCreate = false;
        for (const payment of payments) {
          if (payment.amountPaid <= 0) continue;
          const [pYear, pMonthNum] = payment.billingMonth.split('-').map(Number);
          let coversCurrentMonth = false;
          for (let d = 0; d < payment.durationMonths; d++) {
            const date = new Date(pYear, pMonthNum - 1 + d, 1);
            if (toBillingMonth(date.getFullYear(), date.getMonth() + 1) === currentBillingMonth) {
              coversCurrentMonth = true;
              break;
            }
          }
          if (coversCurrentMonth) {
            applyPaymentStatus(state.payments, customer.id, payment.balance > 0);
          }
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
      const { year: cy, month: cm } = getCurrentYearMonth();
      const currentBillingMonth = toBillingMonth(cy, cm);
      let coversCurrentMonth = false;
      const [pYear, pMonthNum] = updated.billingMonth.split('-').map(Number);
      for (let d = 0; d < updated.durationMonths; d++) {
        const date = new Date(pYear, pMonthNum - 1 + d, 1);
        if (toBillingMonth(date.getFullYear(), date.getMonth() + 1) === currentBillingMonth) {
          coversCurrentMonth = true;
          break;
        }
      }
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingUpdate = false;
        if (coversCurrentMonth) {
          if (updated.amountPaid > 0) {
            applyPaymentStatus(state.payments, customer.id, updated.balance > 0);
          } else {
            clearPaymentStatus(state.payments, customer.id);
          }
        }
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
          clearPaymentStatus(state.payments, customer.id);
        }
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingVoid = false;
      });
    }
  },

  voidPayments: async (ids, voidedBy, notes, customer, year, graceDays) => {
    if (ids.length === 0 || get().payments.loadingVoid) return;
    const idSet = new Set(ids);
    const paymentsToVoid = get().payments.items.filter((p) => idSet.has(p.id));
    set((state) => {
      state.payments.loadingVoid = true;
      state.payments.error = null;
    });
    try {
      await paymentService.voidPayments(ids, voidedBy, notes);
      const items = get().payments.items.filter((p) => !idSet.has(p.id));
      const monthGrid = paymentService.buildMonthGrid(customer, items, year, graceDays);
      const { year: cy, month: cm } = getCurrentYearMonth();
      const currentBillingMonth = toBillingMonth(cy, cm);
      let voidedCurrentMonth = false;
      for (const p of paymentsToVoid) {
        const [pYear, pMonthNum] = p.billingMonth.split('-').map(Number);
        for (let d = 0; d < p.durationMonths; d++) {
          const date = new Date(pYear, pMonthNum - 1 + d, 1);
          if (toBillingMonth(date.getFullYear(), date.getMonth() + 1) === currentBillingMonth) {
            voidedCurrentMonth = true;
            break;
          }
        }
        if (voidedCurrentMonth) break;
      }
      set((state) => {
        state.payments.items = items;
        state.payments.monthGrid = monthGrid;
        state.payments.loadingVoid = false;
        if (voidedCurrentMonth) {
          clearPaymentStatus(state.payments, customer.id);
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

// Mutates the partial / fully-paid sets so the customer sits in exactly one
// (or neither). Used after creates / edits to keep the customer-list badge in
// sync without re-fetching from the DB.
function applyPaymentStatus(
  slice: { currentMonthFullyPaidIds: Set<string>; currentMonthPartialIds: Set<string> },
  customerId: string,
  isPartial: boolean,
): void {
  const targetFull = isPartial ? slice.currentMonthPartialIds : slice.currentMonthFullyPaidIds;
  const targetOther = isPartial ? slice.currentMonthFullyPaidIds : slice.currentMonthPartialIds;
  const nextTarget = new Set(targetFull);
  nextTarget.add(customerId);
  if (isPartial) slice.currentMonthPartialIds = nextTarget;
  else slice.currentMonthFullyPaidIds = nextTarget;
  if (targetOther.has(customerId)) {
    const nextOther = new Set(targetOther);
    nextOther.delete(customerId);
    if (isPartial) slice.currentMonthFullyPaidIds = nextOther;
    else slice.currentMonthPartialIds = nextOther;
  }
}

function clearPaymentStatus(
  slice: { currentMonthFullyPaidIds: Set<string>; currentMonthPartialIds: Set<string> },
  customerId: string,
): void {
  if (slice.currentMonthFullyPaidIds.has(customerId)) {
    const next = new Set(slice.currentMonthFullyPaidIds);
    next.delete(customerId);
    slice.currentMonthFullyPaidIds = next;
  }
  if (slice.currentMonthPartialIds.has(customerId)) {
    const next = new Set(slice.currentMonthPartialIds);
    next.delete(customerId);
    slice.currentMonthPartialIds = next;
  }
}
