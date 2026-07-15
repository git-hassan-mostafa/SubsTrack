import type { StateCreator } from 'zustand';
import type { Currency, CurrentMonthPlanCount, Customer, CustomerPlan, MonthEntry, Payment, Plan, TierPlan } from '@/src/core/types';
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
  customerPlanId: string;
  planId: string | null;
  receivedByUserId: string | null;
  tenantId: string;
  notes: string | null;
}

// One eligible fixed-price line in a customer-list bulk quick pay ("collect all
// due"). A customer with several due lines contributes one request per line.
export interface BulkPayCustomerRequest {
  customerId: string;
  customerPlanId: string;
  plan: Plan;
  currency: Currency | null;
  amountPaid: number;
}

export interface PaymentSlice {
  items: Payment[];
  // The viewed customer's month grids, one per service line, keyed by line id.
  monthGridsByLine: Record<string, MonthEntry[]>;
  // Customers fully settled for the current month (all active lines covered + settled).
  currentMonthFullyPaidIds: Set<string>;
  // Customers with some current-month coverage but not fully settled across lines.
  currentMonthPartialIds: Set<string>;
  // Per customer: how many started service lines are fully paid this month, out
  // of the total. Drives the "N/M plans paid" badge for multi-plan customers.
  currentMonthPlanCounts: Map<string, CurrentMonthPlanCount>;
  // Service-line IDs that already have a covering payment this month (full or
  // partial). Quick pay pays only lines NOT in this set, so a mixed multi-plan
  // customer never re-pays (upserts over) an already-paid line.
  currentMonthCoveredLineIds: Set<string>;
  // Active regular customers with any unpaid month on any active line up to now
  // (even if the current month is paid). Drives the "unpaid" status on the list.
  overdueCustomerIds: Set<string>;
  loading: boolean;
  loadingCreate: boolean;
  loadingVoid: boolean;
  loadingUpdate: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  fetchCurrentMonthPaymentStatus: () => Promise<void>;
  fetchOverdueStatus: (customers: Customer[], graceDays: number) => Promise<void>;
  // Loads all of a customer's payments only when they aren't already in the
  // store, then builds each line's grid for the year.
  getPayments: (
    customerId: string,
    lines: CustomerPlan[],
    year: number,
    graceDays: number,
  ) => Promise<void>;
  fetchPayments: (
    customerId: string,
    lines: CustomerPlan[],
    year: number,
    graceDays: number,
  ) => Promise<void>;
  // Rebuilds the viewed year's grids from payments already in the store — used
  // when navigating years or when the customer's lines change (no re-fetch).
  buildGrids: (lines: CustomerPlan[], year: number, graceDays: number) => void;
  createPayment: (
    data: CreatePaymentInput,
    currency: Currency | null,
    lines: CustomerPlan[],
    graceDays: number,
  ) => Promise<void>;
  createPayments: (
    data: CreatePaymentInput[],
    currency: Currency | null,
    lines: CustomerPlan[],
    year: number,
    graceDays: number,
  ) => Promise<void>;
  // Customer-list "collect all due": pays the current month for many eligible
  // fixed-price lines (one payment each) in one DB round-trip. All-or-nothing —
  // returns the number paid (0 on failure; check error/tierLimitError). The
  // caller refreshes the current-month / overdue status afterwards.
  bulkPayCustomers: (
    requests: BulkPayCustomerRequest[],
    receivedByUserId: string,
    tenantId: string,
    tier: TierPlan,
  ) => Promise<number>;
  createMultiMonthPayment: (
    startMonth: string,
    customer: Customer,
    customerPlanId: string,
    plan: Plan,
    planCurrency: Currency | null,
    amountPaid: number,
    receivedByUserId: string,
    notes: string | null,
    tenantId: string,
    skipConflicts: boolean,
    lines: CustomerPlan[],
    year: number,
    graceDays: number,
    tier: TierPlan,
  ) => Promise<MultiMonthConflict[]>;
  createMultiMonthPayments: (
    starts: string[],
    customer: Customer,
    customerPlanId: string,
    plan: Plan,
    planCurrency: Currency | null,
    amountPaid: number,
    receivedByUserId: string,
    notes: string | null,
    tenantId: string,
    lines: CustomerPlan[],
    year: number,
    graceDays: number,
    tier: TierPlan,
  ) => Promise<MultiMonthConflict[]>;
  updatePayment: (
    id: string,
    amountPaid: number,
    lines: CustomerPlan[],
    year: number,
    graceDays: number,
  ) => Promise<void>;
  voidPayment: (
    id: string,
    voidedBy: string,
    notes: string,
    lines: CustomerPlan[],
    year: number,
    graceDays: number,
  ) => Promise<void>;
  // Customer-list quick void: voids the payment block(s) covering the CURRENT
  // month across all of a customer's lines (fetched on demand). Clears the
  // current-month badge. Returns true if anything was voided.
  voidCurrentMonthForCustomer: (
    customerId: string,
    voidedBy: string,
  ) => Promise<boolean>;
  voidPayments: (
    ids: string[],
    voidedBy: string,
    notes: string,
    lines: CustomerPlan[],
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
  monthGridsByLine: {},
  currentMonthFullyPaidIds: new Set(),
  currentMonthPartialIds: new Set(),
  currentMonthPlanCounts: new Map(),
  currentMonthCoveredLineIds: new Set(),
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
    const { fullyPaidIds, partialIds, planCounts, coveredLineIds } = await paymentService.findPaymentStatusForMonth(billingMonth);
    set((state) => {
      state.payments.currentMonthFullyPaidIds = fullyPaidIds;
      state.payments.currentMonthPartialIds = partialIds;
      state.payments.currentMonthPlanCounts = planCounts;
      state.payments.currentMonthCoveredLineIds = coveredLineIds;
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

  getPayments: async (customerId, lines, year, graceDays) => {
    const items = get().payments.items;
    if (items.length > 0 && items[0].customerId === customerId) {
      get().payments.buildGrids(lines, year, graceDays);
      return;
    }
    await get().payments.fetchPayments(customerId, lines, year, graceDays);
  },

  fetchPayments: async (customerId, lines, year, graceDays) => {
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
    });
    try {
      const items = await paymentService.getPaymentsForCustomer(customerId);
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loading = false;
      });
    }
  },

  buildGrids: (lines, year, graceDays) => {
    const monthGridsByLine = buildGridsFor(lines, get().payments.items, year, graceDays);
    set((state) => {
      state.payments.monthGridsByLine = monthGridsByLine;
    });
  },

  createPayment: async (data, currency, lines, graceDays) => {
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
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        syncCustomerMonthStatus(state.payments, data.customerId, lines, items, graceDays);
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingCreate = false;
      });
    }
  },

  createPayments: async (data, currency, lines, year, graceDays) => {
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
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      const customerId = data[0]?.customerId;
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        if (customerId) syncCustomerMonthStatus(state.payments, customerId, lines, items, graceDays);
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
          customerId: r.customerId,
          customerPlanId: r.customerPlanId,
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
          state.payments.loading = false;
        });
      } else {
        set((state) => {
          state.payments.error = (e as Error).message;
          state.payments.loading = false;
        });
      }
      return 0;
    }
  },

  createMultiMonthPayment: async (
    startMonth,
    customer,
    customerPlanId,
    plan,
    planCurrency,
    amountPaid,
    receivedByUserId,
    notes,
    tenantId,
    skipConflicts,
    lines,
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
      const linePayments = get().payments.items.filter((p) => p.customerPlanId === customerPlanId);
      const { payment, skippedMonths } = await paymentService.createMultiMonthPayment(
        startMonth,
        customer,
        customerPlanId,
        plan,
        amountPaid,
        receivedByUserId,
        notes,
        tenantId,
        linePayments,
        skipConflicts,
        snapshotRate(planCurrency),
        tier,
      );
      const items = [...get().payments.items, payment];
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        syncCustomerMonthStatus(state.payments, customer.id, lines, items, graceDays);
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
    customerPlanId,
    plan,
    planCurrency,
    amountPaid,
    receivedByUserId,
    notes,
    tenantId,
    lines,
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
      const linePayments = get().payments.items.filter((p) => p.customerPlanId === customerPlanId);
      const { payments, skippedMonths } = await paymentService.createMultiMonthPayments(
        starts,
        customer,
        customerPlanId,
        plan,
        amountPaid,
        receivedByUserId,
        notes,
        tenantId,
        linePayments,
        snapshotRate(planCurrency),
        tier,
      );
      const items = [...get().payments.items, ...payments];
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        syncCustomerMonthStatus(state.payments, customer.id, lines, items, graceDays);
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

  updatePayment: async (id, amountPaid, lines, year, graceDays) => {
    if (get().payments.loadingUpdate) return;
    const existing = get().payments.items.find((p) => p.id === id);
    if (!existing) return;
    set((state) => {
      state.payments.loadingUpdate = true;
      state.payments.error = null;
    });
    try {
      const updated = await paymentService.updatePayment(existing, amountPaid);
      const items = get().payments.items.map((p) => (p.id === id ? updated : p));
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingUpdate = false;
        syncCustomerMonthStatus(state.payments, updated.customerId, lines, items, graceDays);
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingUpdate = false;
      });
    }
  },

  voidPayment: async (id, voidedBy, notes, lines, year, graceDays) => {
    if (get().payments.loadingVoid) return;
    const paymentToVoid = get().payments.items.find((p) => p.id === id);
    set((state) => {
      state.payments.loadingVoid = true;
      state.payments.error = null;
    });
    try {
      await paymentService.voidPayment(id, voidedBy, notes);
      const items = get().payments.items.filter((p) => p.id !== id);
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingVoid = false;
        if (paymentToVoid) {
          syncCustomerMonthStatus(state.payments, paymentToVoid.customerId, lines, items, graceDays);
        }
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingVoid = false;
      });
    }
  },

  voidCurrentMonthForCustomer: async (customerId, voidedBy) => {
    if (get().payments.loadingVoid) return false;
    set((state) => {
      state.payments.loadingVoid = true;
      state.payments.error = null;
    });
    try {
      const voided = await paymentService.voidCurrentMonth(customerId, voidedBy, '');
      set((state) => {
        state.payments.loadingVoid = false;
        if (voided.length > 0) clearPaymentStatus(state.payments, customerId);
      });
      return voided.length > 0;
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingVoid = false;
      });
      return false;
    }
  },

  voidPayments: async (ids, voidedBy, notes, lines, year, graceDays) => {
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
      const monthGridsByLine = buildGridsFor(lines, items, year, graceDays);
      const customerId = paymentsToVoid[0]?.customerId;
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingVoid = false;
        if (customerId) syncCustomerMonthStatus(state.payments, customerId, lines, items, graceDays);
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
      state.payments.monthGridsByLine = {};
      state.payments.loading = false;
      state.payments.loadingCreate = false;
      state.payments.loadingVoid = false;
      state.payments.loadingUpdate = false;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    }),
});

// Builds one month grid per line for the given year, keyed by line id. Each
// line's grid is built from only that line's payments (uniqueness is per line).
function buildGridsFor(
  lines: CustomerPlan[],
  items: Payment[],
  year: number,
  graceDays: number,
): Record<string, MonthEntry[]> {
  const grids: Record<string, MonthEntry[]> = {};
  for (const line of lines) {
    const linePayments = items.filter((p) => p.customerPlanId === line.id);
    grids[line.id] = paymentService.buildMonthGrid(line, linePayments, year, graceDays);
  }
  return grids;
}

// The badge-status shape carried by the three status stores kept in lockstep:
// two membership sets + the per-customer plan tally map.
type StatusStore = {
  currentMonthFullyPaidIds: Set<string>;
  currentMonthPartialIds: Set<string>;
  currentMonthPlanCounts: Map<string, CurrentMonthPlanCount>;
  currentMonthCoveredLineIds: Set<string>;
};

// Recomputes a customer's aggregate current-month status from its lines +
// payments and places it in exactly one (or neither) of the badge sets,
// refreshes its "N/M plans paid" tally, and re-syncs which of its lines are
// covered this month (drives quick-pay eligibility).
function syncCustomerMonthStatus(
  slice: StatusStore,
  customerId: string,
  lines: CustomerPlan[],
  items: Payment[],
  graceDays: number,
): void {
  const { status, count, coveredLineIds } = paymentService.computeCurrentMonthStatus(lines, items, graceDays);
  updateCoveredLines(slice, lines, coveredLineIds);
  if (status === 'none') clearPaymentStatus(slice, customerId);
  else {
    applyPaymentStatus(slice, customerId, status === 'partial');
    setPlanCount(slice, customerId, count);
  }
}

// Replaces the covered-line membership for one customer: drops every one of its
// lines from the global set, then re-adds only the currently covered ones.
function updateCoveredLines(
  slice: StatusStore,
  lines: CustomerPlan[],
  coveredLineIds: string[],
): void {
  const next = new Set(slice.currentMonthCoveredLineIds);
  for (const line of lines) next.delete(line.id);
  for (const id of coveredLineIds) next.add(id);
  slice.currentMonthCoveredLineIds = next;
}

// Mutates the partial / fully-paid sets so the customer sits in exactly one.
function applyPaymentStatus(
  slice: StatusStore,
  customerId: string,
  isPartial: boolean,
): void {
  const target = isPartial ? slice.currentMonthPartialIds : slice.currentMonthFullyPaidIds;
  const other = isPartial ? slice.currentMonthFullyPaidIds : slice.currentMonthPartialIds;
  const nextTarget = new Set(target);
  nextTarget.add(customerId);
  if (isPartial) slice.currentMonthPartialIds = nextTarget;
  else slice.currentMonthFullyPaidIds = nextTarget;
  if (other.has(customerId)) {
    const nextOther = new Set(other);
    nextOther.delete(customerId);
    if (isPartial) slice.currentMonthFullyPaidIds = nextOther;
    else slice.currentMonthPartialIds = nextOther;
  }
}

function setPlanCount(
  slice: StatusStore,
  customerId: string,
  count: CurrentMonthPlanCount,
): void {
  const next = new Map(slice.currentMonthPlanCounts);
  next.set(customerId, count);
  slice.currentMonthPlanCounts = next;
}

function clearPaymentStatus(slice: StatusStore, customerId: string): void {
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
  // No current-month coverage left → no "N/M plans paid" tally to show.
  if (slice.currentMonthPlanCounts.has(customerId)) {
    const next = new Map(slice.currentMonthPlanCounts);
    next.delete(customerId);
    slice.currentMonthPlanCounts = next;
  }
}
