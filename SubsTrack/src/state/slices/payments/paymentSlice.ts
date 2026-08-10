import type { StateCreator } from "zustand";
import type {
  Currency,
  Customer,
  CustomerPlan,
  CustomerStatus,
  MonthEntry,
  Payment,
  Plan,
  SkippedMonth,
  TierPlan,
  UnpaidStartRule,
} from "@/src/core/types";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import {
  paymentService,
  skippedMonthService,
  type CreateMultiMonthPaymentResult,
  type MultiMonthConflict,
  type SetSkipInput,
} from "@/src/modules/customer/customer-payments";
import { coveredBillingMonths } from "@/src/modules/customer/customer-payments/utils/payOrder";
import { TierLimitError } from "@/src/modules/admin/subscription";
import type { TierLimitErrorPayload } from "@/src/modules/admin/subscription";
// Deep imports (not the module barrel) — the barrel re-exports screens, which
// would make the state layer pull in UI and risk an import cycle.
import tenantSettingService from "@/src/modules/admin/tenant-settings/services/TenantSettingService";
import { TENANT_SETTING_KEYS } from "@/src/modules/admin/tenant-settings/utils/constants";
import type { GlobalState } from "@/src/state/globalStore";

const snapshotRate = (currency: Currency | null): number =>
  currency?.ratePerUsd ?? 1;

// The tenant's unpaid rule, read cross-slice at call time (never cached) so a
// change in Tenant Settings takes effect on the very next status computation.
const getUnpaidRule = (get: () => GlobalState): UnpaidStartRule =>
  tenantSettingService.parseUnpaidStartRule(
    get().tenantSettings.items.find(
      (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
    )?.value,
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
  // The line itself, not just its id — the service's pay-oldest-first guard
  // needs its start date, and the caller already holds it.
  line: CustomerPlan;
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
  // Per line, the months it still owes (oldest first, ALL years — not just the
  // viewed one). Months are settled oldest-first, so this is what every pay path
  // checks against; the service refuses an out-of-order write regardless.
  unpaidMonthsByLine: Record<string, string[]>;
  // Per line, the months it currently has PAID (ALL years, a multi-month block
  // counted month by month). The mirror of the above for the void paths: voids
  // run newest-first, and a later paid month can sit in a year the grid isn't
  // showing.
  paidMonthsByLine: Record<string, string[]>;
  // The customer list's badge data, keyed by customer id — this month's status,
  // whether older months are still unpaid, the plan tally, and which lines quick
  // pay may collect. ONE map from ONE query, so the badge can never be assembled
  // from two half-loaded sources. A customer that is ABSENT has no status yet;
  // the list renders no payment badge rather than guessing "unpaid" (gotcha #56).
  customerStatuses: Map<string, CustomerStatus>;
  loading: boolean;
  loadingCreate: boolean;
  loadingVoid: boolean;
  loadingUpdate: boolean;
  loadingSkip: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  // Rebuilds the whole customerStatuses map. One call, one query — every badge
  // fact lands together, so nothing can be shown from partial data.
  fetchCustomerStatuses: (customers: Customer[]) => Promise<void>;
  // Loads all of a customer's payments only when they aren't already in the
  // store, then builds each line's grid for the year.
  getPayments: (
    customerId: string,
    lines: CustomerPlan[],
    year: number,
  ) => Promise<void>;
  fetchPayments: (
    customerId: string,
    lines: CustomerPlan[],
    year: number,
  ) => Promise<void>;
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
    year: number,
  ) => Promise<void>;
  // Returns the created payment so the caller can build a receipt/invoice from
  // the real record (id, paidAt). null = the write failed; check `error`.
  createPayment: (
    data: CreatePaymentInput,
    currency: Currency | null,
    lines: CustomerPlan[],
  ) => Promise<Payment | null>;
  // Returns the created payments so one invoice can cover the whole batch
  // (empty on failure; check `error`).
  createPayments: (
    data: CreatePaymentInput[],
    currency: Currency | null,
    lines: CustomerPlan[],
    year: number,
  ) => Promise<Payment[]>;
  // Customer-list "collect all due": pays the current month for many eligible
  // fixed-price lines (one payment each) in one DB round-trip. All-or-nothing —
  // returns the created payments (empty on failure; check error/tierLimitError),
  // so a caller can both count them and build one invoice covering every line.
  // The caller refreshes the current-month / overdue status afterwards.
  bulkPayCustomers: (
    requests: BulkPayCustomerRequest[],
    receivedByUserId: string,
    tenantId: string,
    tier: TierPlan,
  ) => Promise<Payment[]>;
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
    tier: TierPlan,
    // The service's own shape, forwarded whole: the payment (for a receipt) plus
    // the months the block stepped over. null = the write failed.
  ) => Promise<CreateMultiMonthPaymentResult | null>;
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
    tier: TierPlan,
    // The created blocks (for one batch invoice) plus the months the blocks
    // stepped over. null = the write failed.
  ) => Promise<{
    payments: Payment[];
    conflictMonths: MultiMonthConflict[];
  } | null>;
  updatePayment: (
    id: string,
    amountPaid: number,
    lines: CustomerPlan[],
    year: number,
  ) => Promise<void>;
  voidPayment: (
    id: string,
    voidedBy: string,
    notes: string,
    lines: CustomerPlan[],
    year: number,
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
  ) => Promise<void>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createPaymentSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  PaymentSlice
> = (set, get) => ({
  items: [],
  skips: [],
  monthGridsByLine: {},
  unpaidMonthsByLine: {},
  paidMonthsByLine: {},
  customerStatuses: new Map(),
  loading: false,
  loadingCreate: false,
  loadingVoid: false,
  loadingUpdate: false,
  loadingSkip: false,
  error: null,
  tierLimitError: null,

  fetchCustomerStatuses: async (customers) => {
    if (customers.length == 0) return;
    const statuses = await paymentService.getCustomerStatuses(
      customers,
      getUnpaidRule(get),
    );
    set((state) => {
      state.payments.customerStatuses = statuses;
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
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      set((state) => {
        state.payments.items = items;
        state.payments.skips = skips;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
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
    const { grids, unpaidMonths, paidMonths } = buildGridsFor(
      lines,
      items,
      skips,
      year,
      getUnpaidRule(get),
    );
    set((state) => {
      state.payments.monthGridsByLine = grids;
      state.payments.unpaidMonthsByLine = unpaidMonths;
      state.payments.paidMonthsByLine = paidMonths;
    });
  },

  setMonthsSkipped: async (inputs, skipped, tenantId, userId, lines, year) => {
    if (inputs.length === 0 || get().payments.loadingSkip) return;
    set((state) => {
      state.payments.loadingSkip = true;
      state.payments.error = null;
    });
    try {
      const written = await skippedMonthService.setSkipped(
        inputs,
        skipped,
        tenantId,
        userId,
      );
      // One row per (line, month): replace the touched keys, then drop the ones
      // that were just unskipped — the store only holds ACTIVE skips.
      const touched = new Set(
        written.map((s) => `${s.customerPlanId}|${s.billingMonth}`),
      );
      const skips = [
        ...get().payments.skips.filter(
          (s) => !touched.has(`${s.customerPlanId}|${s.billingMonth}`),
        ),
        ...written.filter((s) => s.skipped),
      ];
      const items = get().payments.items;
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      const customerId = inputs[0].customerId;
      set((state) => {
        state.payments.skips = skips;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingSkip = false;
        syncCustomerStatus(
          state.payments,
          customerId,
          lines,
          items,
          skips,
          getUnpaidRule(get),
        );
      });
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingSkip = false;
      });
    }
  },

  createPayment: async (data, currency, lines) => {
    if (get().payments.loadingCreate) return null;
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
    });
    try {
      assertPayOrder(
        lines,
        data.customerPlanId,
        coveredBillingMonths(data.billingMonth, data.durationMonths),
        get().payments.items,
        get().payments.skips,
        getUnpaidRule(get),
      );
      const payment = await paymentService.createPayment({
        ...data,
        ratePerUsdSnapshot: snapshotRate(currency),
      });
      const [year] = data.billingMonth.split("-").map(Number);
      const items = [...get().payments.items, payment];
      const skips = get().payments.skips;
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingCreate = false;
        syncCustomerStatus(
          state.payments,
          data.customerId,
          lines,
          items,
          skips,
          getUnpaidRule(get),
        );
      });
      return payment;
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingCreate = false;
      });
      return null;
    }
  },

  createPayments: async (data, currency, lines, year) => {
    if (data.length === 0 || get().payments.loadingCreate) return [];
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
    });
    try {
      // The batch is checked per line, and every month in it counts as covered —
      // paying a whole backlog in one go is allowed, cherry-picking is not.
      for (const [customerPlanId, months] of groupTargetMonths(data)) {
        assertPayOrder(
          lines,
          customerPlanId,
          months,
          get().payments.items,
          get().payments.skips,
          getUnpaidRule(get),
        );
      }
      const rate = snapshotRate(currency);
      const created = await paymentService.createPayments(
        data.map((d) => ({ ...d, ratePerUsdSnapshot: rate })),
      );
      const items = [...get().payments.items, ...created];
      const skips = get().payments.skips;
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      const customerId = data[0]?.customerId;
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingCreate = false;
        if (customerId)
          syncCustomerStatus(
            state.payments,
            customerId,
            lines,
            items,
            skips,
            getUnpaidRule(get),
          );
      });
      return created;
    } catch (e) {
      set((state) => {
        state.payments.error = (e as Error).message;
        state.payments.loadingCreate = false;
      });
      return [];
    }
  },

  bulkPayCustomers: async (requests, receivedByUserId, tenantId, tier) => {
    if (requests.length === 0 || get().payments.loadingCreate) return [];
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
          line: r.line,
          plan: r.plan,
          billingMonth,
          amountPaid: r.amountPaid,
          ratePerUsdSnapshot: snapshotRate(r.currency),
        })),
        receivedByUserId,
        tenantId,
        tier,
        // The service checks the pay order itself here: this batch spans many
        // customers whose payments the slice does not hold.
        getUnpaidRule(get),
      );
      set((state) => {
        state.payments.loading = false;
      });
      return created;
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
      return [];
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
    if (get().payments.loadingCreate) return null;
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    });
    try {
      const linePayments = get().payments.items.filter(
        (p) => p.customerPlanId === customerPlanId,
      );
      const lineSkips = get().payments.skips.filter(
        (s) => s.customerPlanId === customerPlanId,
      );
      assertPayOrder(
        lines,
        customerPlanId,
        coveredBillingMonths(startMonth, plan.durationMonths),
        get().payments.items,
        get().payments.skips,
        getUnpaidRule(get),
      );
      const { payment, conflictMonths } =
        await paymentService.createMultiMonthPayment(
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
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingCreate = false;
        syncCustomerStatus(
          state.payments,
          customer.id,
          lines,
          items,
          skips,
          getUnpaidRule(get),
        );
      });
      return { payment, conflictMonths };
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
      return null;
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
    if (starts.length === 0 || get().payments.loadingCreate) return null;
    set((state) => {
      state.payments.loadingCreate = true;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    });
    try {
      const linePayments = get().payments.items.filter(
        (p) => p.customerPlanId === customerPlanId,
      );
      const lineSkips = get().payments.skips.filter(
        (s) => s.customerPlanId === customerPlanId,
      );
      assertPayOrder(
        lines,
        customerPlanId,
        starts.flatMap((s) => coveredBillingMonths(s, plan.durationMonths)),
        get().payments.items,
        get().payments.skips,
        getUnpaidRule(get),
      );
      const { payments, conflictMonths } =
        await paymentService.createMultiMonthPayments(
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
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingCreate = false;
        syncCustomerStatus(
          state.payments,
          customer.id,
          lines,
          items,
          skips,
          getUnpaidRule(get),
        );
      });
      return { payments, conflictMonths };
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
      return null;
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
      const items = get().payments.items.map((p) =>
        p.id === id ? updated : p,
      );
      const skips = get().payments.skips;
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingUpdate = false;
        syncCustomerStatus(
          state.payments,
          updated.customerId,
          lines,
          items,
          skips,
          getUnpaidRule(get),
        );
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
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingVoid = false;
        if (paymentToVoid) {
          syncCustomerStatus(
            state.payments,
            paymentToVoid.customerId,
            lines,
            items,
            skips,
            getUnpaidRule(get),
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

  voidCurrentMonthForCustomer: async (customerId, voidedBy) => {
    if (get().payments.loadingVoid) return false;
    set((state) => {
      state.payments.loadingVoid = true;
      state.payments.error = null;
    });
    try {
      const voided = await paymentService.voidCurrentMonth(
        customerId,
        voidedBy,
        "",
      );
      set((state) => {
        state.payments.loadingVoid = false;
        if (voided.length > 0) forgetCustomerStatus(state.payments, customerId);
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
      const { grids, unpaidMonths, paidMonths } = buildGridsFor(
        lines,
        items,
        skips,
        year,
        getUnpaidRule(get),
      );
      const customerId = paymentsToVoid[0]?.customerId;
      set((state) => {
        state.payments.items = items;
        state.payments.monthGridsByLine = grids;
        state.payments.unpaidMonthsByLine = unpaidMonths;
        state.payments.paidMonthsByLine = paidMonths;
        state.payments.loadingVoid = false;
        if (customerId)
          syncCustomerStatus(
            state.payments,
            customerId,
            lines,
            items,
            skips,
            getUnpaidRule(get),
          );
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
      state.payments.unpaidMonthsByLine = {};
      state.payments.paidMonthsByLine = {};
      // Tenant-scoped — or the next tenant on this device inherits stale badges.
      state.payments.customerStatuses = new Map();
      state.payments.loading = false;
      state.payments.loadingCreate = false;
      state.payments.loadingVoid = false;
      state.payments.loadingUpdate = false;
      state.payments.loadingSkip = false;
      state.payments.error = null;
      state.payments.tierLimitError = null;
    }),
});

// Builds one month grid per line for the given year, plus each line's full
// still-unpaid and currently-paid month lists (all years — the two order gates
// need months the viewed year can't show). All three come from the same per-line
// payment/skip slice, so one pass keeps them in step.
function buildGridsFor(
  lines: CustomerPlan[],
  items: Payment[],
  skips: SkippedMonth[],
  year: number,
  unpaidRule: UnpaidStartRule,
): {
  grids: Record<string, MonthEntry[]>;
  unpaidMonths: Record<string, string[]>;
  paidMonths: Record<string, string[]>;
} {
  const grids: Record<string, MonthEntry[]> = {};
  const unpaidMonths: Record<string, string[]> = {};
  const paidMonths: Record<string, string[]> = {};
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
    unpaidMonths[line.id] = paymentService.unpaidBillingMonths(
      line,
      linePayments,
      lineSkips,
      unpaidRule,
    );
    paidMonths[line.id] = paymentService.paidBillingMonths(linePayments);
  }
  return { grids, unpaidMonths, paidMonths };
}

// A batch create can touch several service lines, and the order rule is per
// line — bucket the months it would cover by line id.
function groupTargetMonths(inputs: CreatePaymentInput[]): Map<string, string[]> {
  const byLine = new Map<string, string[]>();
  for (const i of inputs) {
    const months = coveredBillingMonths(i.billingMonth, i.durationMonths);
    const list = byLine.get(i.customerPlanId);
    if (list) list.push(...months);
    else byLine.set(i.customerPlanId, months);
  }
  return byLine;
}

// Refuses a write that would leave an older month unpaid behind it. The decision
// lives in PaymentService (rule #1); the slice only supplies the line's own
// payments + skips, which it already holds for the viewed customer. A line that
// isn't loaded can't be checked here — the service guard still covers it.
function assertPayOrder(
  lines: CustomerPlan[],
  customerPlanId: string,
  targetMonths: string[],
  items: Payment[],
  skips: SkippedMonth[],
  unpaidRule: UnpaidStartRule,
): void {
  const line = lines.find((l) => l.id === customerPlanId);
  if (!line) return;
  paymentService.assertPayableInOrder(
    line,
    targetMonths,
    items.filter((p) => p.customerPlanId === customerPlanId),
    skips.filter((s) => s.customerPlanId === customerPlanId),
    unpaidRule,
  );
}

// Recomputes ONE customer's entry in the badge map after a local mutation, so
// the list stays correct without another round-trip. `payments` must be that
// customer's FULL history — the slice holds exactly that for the viewed
// customer (findByCustomer is not year-scoped), which is what lets `overdue` be
// recomputed locally too.
function syncCustomerStatus(
  slice: { customerStatuses: Map<string, CustomerStatus> },
  customerId: string,
  lines: CustomerPlan[],
  payments: Payment[],
  skips: SkippedMonth[],
  unpaidRule: UnpaidStartRule,
): void {
  const next = new Map(slice.customerStatuses);
  next.set(
    customerId,
    paymentService.buildCustomerStatus(lines, payments, skips, unpaidRule),
  );
  slice.customerStatuses = next;
}

// Drops a customer from the badge map — used when a mutation invalidates the
// entry but the slice lacks the data to rebuild it. The card then shows no
// payment badge until the next fetch, which is honest; guessing is not.
function forgetCustomerStatus(
  slice: { customerStatuses: Map<string, CustomerStatus> },
  customerId: string,
): void {
  if (!slice.customerStatuses.has(customerId)) return;
  const next = new Map(slice.customerStatuses);
  next.delete(customerId);
  slice.customerStatuses = next;
}
