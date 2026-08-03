import type { StateCreator } from 'zustand';
import type { Currency, CurrentMonthPlanCount, Customer, CustomerPlan, MonthEntry, Payment, Plan, SkippedMonth, TierPlan, UnpaidStartRule } from '@/src/core/types';
import { getCurrentYearMonth, toBillingMonth } from '@/src/core/utils/date';
import {
  paymentService,
  skippedMonthService,
  type MultiMonthConflict,
  type SetSkipInput,
} from '@/src/modules/customer/customer-payments';
import { TierLimitError } from '@/src/modules/admin/subscription';
import type { TierLimitErrorPayload } from '@/src/modules/admin/subscription';
// Deep imports (not the module barrel) — the barrel re-exports screens, which
// would make the state layer pull in UI and risk an import cycle.
import tenantSettingService from '@/src/modules/admin/tenant-settings/services/TenantSettingService';
import { TENANT_SETTING_KEYS } from '@/src/modules/admin/tenant-settings/utils/constants';
import type { GlobalState } from '@/src/state/globalStore';

const snapshotRate = (currency: Currency | null): number => currency?.ratePerUsd ?? 1;

// The tenant's unpaid rule, read cross-slice at call time (never cached) so a
// change in Tenant Settings takes effect on the very next status computation.
const getUnpaidRule = (get: () => GlobalState): UnpaidStartRule =>
  tenantSettingService.parseUnpaidStartRule(
    get().tenantSettings.items.find((s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule)?.value,
  );

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
  // The viewed customer's active skipped months (all lines, all years) — the
  // grid needs them alongside the payments.
  skips: SkippedMonth[];
  // The viewed customer's month grids, one per service line, keyed by line id.
  monthGridsByLine: Record<string, MonthEntry[]>;
  // Customers fully settled for the current month (all active lines covered + settled).
  currentMonthFullyPaidIds: Set<string>;
  // Customers with some current-month coverage but not fully settled across lines.
  currentMonthPartialIds: Set<string>;
  // Customers owing nothing this month because every started line is skipped —
  // without this they'd fall through to the list's red "unpaid" default.
  currentMonthSkippedIds: Set<string>;
  // Customers owing nothing YET because no started line has reached its billing
  // day ('customer_start_day' rule). Same "keep them out of the red default"
  // purpose as currentMonthSkippedIds. Always empty under the 'month_start' rule.
  currentMonthNotDueYetIds: Set<string>;
  // Per customer: how many started service lines are fully paid this month, out
  // of the total. Drives the "N/M plans paid" badge for multi-plan customers.
  currentMonthPlanCounts: Map<string, CurrentMonthPlanCount>;
  // Service-line IDs NOT due this month: already covered by a payment (full or
  // partial) or skipped. Quick pay pays only lines outside this set, so a mixed
  // multi-plan customer never re-pays (upserts over) a paid line, and never pays
  // a skipped one.
  currentMonthNotDueLineIds: Set<string>;
  // Active regular customers with any unpaid month on any active line up to now
  // (even if the current month is paid). Drives the "unpaid" status on the list.
  overdueCustomerIds: Set<string>;
  loading: boolean;
  loadingCreate: boolean;
  loadingVoid: boolean;
  loadingUpdate: boolean;
  loadingSkip: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  fetchCurrentMonthPaymentStatus: () => Promise<void>;
  fetchOverdueStatus: (customers: Customer[]) => Promise<void>;
  // Loads all of a customer's payments only when they aren't already in the
  // store, then builds each line's grid for the year.
  getPayments: (
    customerId: string,
    lines: CustomerPlan[],
    year: number,  ) => Promise<void>;
  fetchPayments: (
    customerId: string,
    lines: CustomerPlan[],
    year: number,  ) => Promise<void>;
  // Rebuilds the viewed year's grids from payments/skips already in the store —
  // used when navigating years or when the customer's lines change (no re-fetch).
  buildGrids: (lines: CustomerPlan[], year: number) => void;
  // Skips (or unskips) any number of months on the viewed customer's lines and
  // rebuilds the grids. A skipped month is never unpaid and never payable.
  setMonthsSkipped: (
    inputs: SetSkipInput[],
    skipped: boolean,
    tenantId: string,
    userId: string | null,
    lines: CustomerPlan[],
    year: number,  ) => Promise<void>;
  createPayment: (
    data: CreatePaymentInput,
    currency: Currency | null,
    lines: CustomerPlan[],  ) => Promise<void>;
  createPayments: (
    data: CreatePaymentInput[],
    currency: Currency | null,
    lines: CustomerPlan[],
    year: number,  ) => Promise<void>;
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
    year: number,    tier: TierPlan,
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
    year: number,    tier: TierPlan,
  ) => Promise<MultiMonthConflict[]>;
  updatePayment: (
    id: string,
    amountPaid: number,
    lines: CustomerPlan[],
    year: number,  ) => Promise<void>;
  voidPayment: (
    id: string,
    voidedBy: string,
    notes: string,
    lines: CustomerPlan[],
    year: number,  ) => Promise<void>;
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
    year: number,  ) => Promise<void>;
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
  skips: [],
  monthGridsByLine: {},
  currentMonthFullyPaidIds: new Set(),
  currentMonthPartialIds: new Set(),
  currentMonthSkippedIds: new Set(),
  currentMonthNotDueYetIds: new Set(),
  currentMonthPlanCounts: new Map(),
  currentMonthNotDueLineIds: new Set(),
  overdueCustomerIds: new Set(),
  loading: false,
  loadingCreate: false,
  loadingVoid: false,
  loadingUpdate: false,
  loadingSkip: false,
  error: null,
  tierLimitError: null,

  fetchCurrentMonthPaymentStatus: async () => {
    const { year, month } = getCurrentYearMonth();
    const billingMonth = toBillingMonth(year, month);
    const { fullyPaidIds, partialIds, skippedIds, notDueYetIds, planCounts, notDueLineIds } =
      await paymentService.findPaymentStatusForMonth(billingMonth, getUnpaidRule(get));
    set((state) => {
      state.payments.currentMonthFullyPaidIds = fullyPaidIds;
      state.payments.currentMonthPartialIds = partialIds;
      state.payments.currentMonthSkippedIds = skippedIds;
      state.payments.currentMonthNotDueYetIds = notDueYetIds;
      state.payments.currentMonthPlanCounts = planCounts;
      state.payments.currentMonthNotDueLineIds = notDueLineIds;
    });
  },

  fetchOverdueStatus: async (customers) => {
    const overdueCustomerIds =
      await paymentService.findOverdueCustomerIds(customers, getUnpaidRule(get));
    set((state) => {
      state.payments.overdueCustomerIds = overdueCustomerIds;
    });
  },

  getPayments: async (customerId, lines, year) => {
    const items = get().payments.items;
    if (items.length > 0 && items[0].customerId === customerId) {
      get().payments.buildGrids(lines, year);
      return;
    }
    await get().payments.fetchPayments(customerId, lines, year);
  },

  fetchPayments: async (customerId, lines, year) => {
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
    });
    try {
      const [items, skips] = await Promise.all([
        paymentService.getPaymentsForCustomer(customerId),
        skippedMonthService.getSkipsForCustomer(customerId),
      ]);
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.items = items;
        state.payments.skips = skips;
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

  buildGrids: (lines, year) => {
    const { items, skips } = get().payments;
    const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
    set((state) => {
      state.payments.monthGridsByLine = monthGridsByLine;
    });
  },

  setMonthsSkipped: async (inputs, skipped, tenantId, userId, lines, year) => {
    if (inputs.length === 0 || get().payments.loadingSkip) return;
    set((state) => {
      state.payments.loadingSkip = true;
      state.payments.error = null;
    });
    try {
      const written = await skippedMonthService.setSkipped(inputs, skipped, tenantId, userId);
      // One row per (line, month): replace the touched keys, then drop the ones
      // that were just unskipped — the store only holds ACTIVE skips.
      const touched = new Set(written.map((s) => `${s.customerPlanId}|${s.billingMonth}`));
      const skips = [
        ...get().payments.skips.filter(
          (s) => !touched.has(`${s.customerPlanId}|${s.billingMonth}`),
        ),
        ...written.filter((s) => s.skipped),
      ];
      const items = get().payments.items;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      const customerId = inputs[0].customerId;
      set((state) => {
        state.payments.skips = skips;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingSkip = false;
        syncCustomerMonthStatus(state.payments, customerId, lines, items, skips, getUnpaidRule(get));
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingSkip = false;
      });
    }
  },

  createPayment: async (data, currency, lines) => {
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
      const skips = get().payments.skips;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        syncCustomerMonthStatus(state.payments, data.customerId, lines, items, skips, getUnpaidRule(get));
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingCreate = false;
      });
    }
  },

  createPayments: async (data, currency, lines, year) => {
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
      const skips = get().payments.skips;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      const customerId = data[0]?.customerId;
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        if (customerId) syncCustomerMonthStatus(state.payments, customerId, lines, items, skips, getUnpaidRule(get));
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
      const lineSkips = get().payments.skips.filter((s) => s.customerPlanId === customerPlanId);
      const { payment, conflictMonths } = await paymentService.createMultiMonthPayment(
        startMonth,
        customer,
        customerPlanId,
        plan,
        amountPaid,
        receivedByUserId,
        notes,
        tenantId,
        linePayments,
        lineSkips,
        skipConflicts,
        snapshotRate(planCurrency),
        tier,
      );
      const items = [...get().payments.items, payment];
      const skips = get().payments.skips;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        syncCustomerMonthStatus(state.payments, customer.id, lines, items, skips, getUnpaidRule(get));
      });
      return conflictMonths;
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
      const lineSkips = get().payments.skips.filter((s) => s.customerPlanId === customerPlanId);
      const { payments, conflictMonths } = await paymentService.createMultiMonthPayments(
        starts,
        customer,
        customerPlanId,
        plan,
        amountPaid,
        receivedByUserId,
        notes,
        tenantId,
        linePayments,
        lineSkips,
        snapshotRate(planCurrency),
        tier,
      );
      const items = [...get().payments.items, ...payments];
      const skips = get().payments.skips;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingCreate = false;
        syncCustomerMonthStatus(state.payments, customer.id, lines, items, skips, getUnpaidRule(get));
      });
      return conflictMonths;
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

  updatePayment: async (id, amountPaid, lines, year) => {
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
      const skips = get().payments.skips;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingUpdate = false;
        syncCustomerMonthStatus(state.payments, updated.customerId, lines, items, skips, getUnpaidRule(get));
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingUpdate = false;
      });
    }
  },

  voidPayment: async (id, voidedBy, notes, lines, year) => {
    if (get().payments.loadingVoid) return;
    const paymentToVoid = get().payments.items.find((p) => p.id === id);
    set((state) => {
      state.payments.loadingVoid = true;
      state.payments.error = null;
    });
    try {
      await paymentService.voidPayment(id, voidedBy, notes);
      const items = get().payments.items.filter((p) => p.id !== id);
      const skips = get().payments.skips;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingVoid = false;
        if (paymentToVoid) {
          syncCustomerMonthStatus(state.payments, paymentToVoid.customerId, lines, items, skips, getUnpaidRule(get));
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

  voidPayments: async (ids, voidedBy, notes, lines, year) => {
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
      const skips = get().payments.skips;
      const monthGridsByLine = buildGridsFor(lines, items, skips, year, getUnpaidRule(get));
      const customerId = paymentsToVoid[0]?.customerId;
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = monthGridsByLine;
        state.payments.loadingVoid = false;
        if (customerId) syncCustomerMonthStatus(state.payments, customerId, lines, items, skips, getUnpaidRule(get));
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
      state.payments.skips = [];
      state.payments.monthGridsByLine = {};
      state.payments.currentMonthNotDueYetIds = new Set();
      state.payments.loading = false;
      state.payments.loadingCreate = false;
      state.payments.loadingVoid = false;
      state.payments.loadingUpdate = false;
      state.payments.loadingSkip = false;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    }),
});

// Builds one month grid per line for the given year, keyed by line id. Each
// line's grid is built from only that line's payments + skips (uniqueness is
// per line).
function buildGridsFor(
  lines: CustomerPlan[],
  items: Payment[],
  skips: SkippedMonth[],
  year: number,
  unpaidRule: UnpaidStartRule,
): Record<string, MonthEntry[]> {
  const grids: Record<string, MonthEntry[]> = {};
  for (const line of lines) {
    const linePayments = items.filter((p) => p.customerPlanId === line.id);
    const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
    grids[line.id] = paymentService.buildMonthGrid(
      line,
      linePayments,
      lineSkips,
      year,
      unpaidRule,
    );
  }
  return grids;
}

// The badge-status shape carried by the three status stores kept in lockstep:
// two membership sets + the per-customer plan tally map.
type StatusStore = {
  currentMonthFullyPaidIds: Set<string>;
  currentMonthPartialIds: Set<string>;
  currentMonthSkippedIds: Set<string>;
  currentMonthNotDueYetIds: Set<string>;
  currentMonthPlanCounts: Map<string, CurrentMonthPlanCount>;
  currentMonthNotDueLineIds: Set<string>;
};

// Recomputes a customer's aggregate current-month status from its lines +
// payments + skips and places it in exactly one (or neither) of the badge sets,
// refreshes its "N/M plans paid" tally, and re-syncs which of its lines are not
// due this month (drives quick-pay eligibility).
function syncCustomerMonthStatus(
  slice: StatusStore,
  customerId: string,
  lines: CustomerPlan[],
  items: Payment[],
  skips: SkippedMonth[],
  unpaidRule: UnpaidStartRule,
): void {
  const { status, count, notDueLineIds } = paymentService.computeCurrentMonthStatus(
    lines,
    items,
    skips,
    unpaidRule,
  );
  updateNotDueLines(slice, lines, notDueLineIds);
  setSkippedStatus(slice, customerId, status === 'skipped');
  setNotDueYetStatus(slice, customerId, status === 'notDueYet');
  if (status === 'none' || status === 'skipped' || status === 'notDueYet') {
    clearPaymentStatus(slice, customerId);
  } else {
    applyPaymentStatus(slice, customerId, status === 'partial');
    setPlanCount(slice, customerId, count);
  }
}

// Adds/removes the customer from the "nothing owed — all lines skipped" set.
function setSkippedStatus(slice: StatusStore, customerId: string, skipped: boolean): void {
  if (skipped === slice.currentMonthSkippedIds.has(customerId)) return;
  const next = new Set(slice.currentMonthSkippedIds);
  if (skipped) next.add(customerId);
  else next.delete(customerId);
  slice.currentMonthSkippedIds = next;
}

// Adds/removes the customer from the "nothing owed YET — no line has reached its
// billing day" set ('customer_start_day' rule).
function setNotDueYetStatus(slice: StatusStore, customerId: string, notDueYet: boolean): void {
  if (notDueYet === slice.currentMonthNotDueYetIds.has(customerId)) return;
  const next = new Set(slice.currentMonthNotDueYetIds);
  if (notDueYet) next.add(customerId);
  else next.delete(customerId);
  slice.currentMonthNotDueYetIds = next;
}

// Replaces the not-due membership for one customer: drops every one of its
// lines from the global set, then re-adds only the currently not-due ones.
function updateNotDueLines(
  slice: StatusStore,
  lines: CustomerPlan[],
  notDueLineIds: string[],
): void {
  const next = new Set(slice.currentMonthNotDueLineIds);
  for (const line of lines) next.delete(line.id);
  for (const id of notDueLineIds) next.add(id);
  slice.currentMonthNotDueLineIds = next;
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
