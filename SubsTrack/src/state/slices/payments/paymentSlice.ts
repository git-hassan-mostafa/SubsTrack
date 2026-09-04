import type { StateCreator } from "zustand";
import type {
  Collection,
  Customer,
  CustomerPlan,
  CustomerStatus,
  MonthBill,
  MonthEntry,
  SkippedMonth,
} from "@/src/core/types";
import {
  paymentService,
  skippedMonthService,
  type SetSkipInput,
} from "@/src/modules/customer/customer-payments";
import { chargeService } from "@/src/modules/ledger";
import type { GlobalState } from "@/src/state/globalStore";
import { buildGridsFor } from "./utils/buildGrids";
import { groupMonthsByLine } from "./utils/groupMonthsByLine";
import { mergeCollection } from "./utils/mergeCollection";
import { getUnpaidRule } from "./utils/unpaidRule";

/**
 * Month-grid state ONLY.
 *
 * Every write that moves money lives in the `ledger` slice — a month is settled
 * by collecting, exactly like a sale or a custom fee, so there is no separate
 * "record a payment" path any more. What is left here is the viewed customer's
 * bills and skips, and the three per-line derivations the UI gates on.
 */
export interface PaymentSlice {
  bills: MonthBill[];
  skips: SkippedMonth[];
  monthGridsByLine: Record<string, MonthEntry[]>;
  uncoveredMonthsByLine: Record<string, string[]>;
  paidMonthsByLine: Record<string, string[]>;
  customerStatuses: Map<string, CustomerStatus>;
  billsCustomerId: string | null;
  loading: boolean;
  loadingSkip: boolean;
  error: string | null;

  fetchCustomerStatuses: (customers: Customer[]) => Promise<void>;
  fetchBills: (customerId: string) => Promise<void>;
  applyCollection: (
    collection: Collection,
    sign?: 1 | -1,
  ) => void;
  buildGrids: (lines: CustomerPlan[], year: number) => void;
  syncCustomerStatus: (customerId: string, lines: CustomerPlan[]) => Promise<void>;
  setMonthsSkipped: (
    inputs: SetSkipInput[],
    skipped: boolean,
    tenantId: string,
    userId: string | null,
  ) => Promise<void>;
  voidMonthBill: (
    chargeId: string,
    voidedBy: string,
    reason: string | null,
  ) => Promise<{ ok: boolean; blockedBy: string | null }>;
  clearError: () => void;
  reset: () => void;
}

export const createPaymentSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  PaymentSlice
> = (set, get) => ({
  bills: [],
  skips: [],
  monthGridsByLine: {},
  uncoveredMonthsByLine: {},
  paidMonthsByLine: {},
  customerStatuses: new Map(),
  billsCustomerId: null,
  loading: false,
  loadingSkip: false,
  error: null,

  fetchCustomerStatuses: async (customers) => {
    if (customers.length === 0) return;
    const lineIds = customers.flatMap((c) => (c.customerPlans ?? []).map((l) => l.id));
    const [billsByLine, skips] = await Promise.all([
      chargeService.getMonthBillsForLines(lineIds),
      skippedMonthService.getActiveSkips(),
    ]);
    const bills = [...billsByLine.values()].flat();
    set((state) => {
      state.payments.customerStatuses = paymentService.getCustomerStatuses(
        customers,
        bills,
        skips,
        getUnpaidRule(get),
      );
    });
  },

  fetchBills: async (customerId) => {
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
    });
    try {
      const [bills, skips] = await Promise.all([
        chargeService.getMonthBillsForCustomer(customerId),
        skippedMonthService.getSkipsForCustomer(customerId),
      ]);
      set((state) => {
        state.payments.bills = bills;
        state.payments.skips = skips;
        state.payments.billsCustomerId = customerId;
        state.payments.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.payments.error = e instanceof Error ? e.message : String(e);
        state.payments.loading = false;
      });
    }
  },

  applyCollection: (collection, sign = 1) => {
    const bills = mergeCollection(get().payments.bills, collection, sign);
    set((state) => {
      state.payments.bills = bills;
    });
  },

  buildGrids: (lines, year) => {
    const { bills, skips } = get().payments;
    const derived = buildGridsFor(lines, bills, skips, year, getUnpaidRule(get));
    set((state) => {
      state.payments.monthGridsByLine = derived.grids;
      state.payments.uncoveredMonthsByLine = derived.uncoveredMonths;
      state.payments.paidMonthsByLine = derived.paidMonths;
    });
  },

  syncCustomerStatus: async (customerId, lines) => {
    const [billsByLine, skips] = await Promise.all([
      chargeService.getMonthBillsForLines(lines.map((l) => l.id)),
      skippedMonthService.getSkipsForCustomer(customerId),
    ]);
    const bills = [...billsByLine.values()].flat();
    const status = paymentService.buildCustomerStatus(
      lines,
      bills,
      skips,
      getUnpaidRule(get),
    );
    set((state) => {
      state.payments.customerStatuses.set(customerId, status);
    });
  },

  setMonthsSkipped: async (inputs, skipped, tenantId, userId) => {
    set((state) => {
      state.payments.loadingSkip = true;
      state.payments.error = null;
    });
    try {
      if (!skipped) {
        const { bills } = get().payments;
        for (const [lineId, months] of groupMonthsByLine(inputs)) {
          paymentService.assertUnskippableInOrder(
            months,
            bills.filter((b) => b.charge.customerPlanId === lineId),
          );
        }
      }
      await skippedMonthService.setSkipped(inputs, skipped, tenantId, userId);
      const skips = await skippedMonthService.getSkipsForCustomer(inputs[0].customerId);
      set((state) => {
        state.payments.skips = skips;
        state.payments.loadingSkip = false;
      });
    } catch (e) {
      set((state) => {
        state.payments.error = e instanceof Error ? e.message : String(e);
        state.payments.loadingSkip = false;
      });
    }
  },

  voidMonthBill: async (chargeId, voidedBy, reason) => {
    const { bills } = get().payments;
    const target = bills.find((b) => b.charge.id === chargeId);
    if (target) {
      const lineId = target.charge.customerPlanId;
      const blockedBy = paymentService.billVoidOrderBlocker(
        target,
        bills.filter((b) => b.charge.customerPlanId === lineId),
      );
      if (blockedBy) return { ok: false, blockedBy };
    }
    const ok = await get().ledger.voidChargeWithPayments(chargeId, voidedBy, reason);
    return { ok, blockedBy: null };
  },

  clearError: () => {
    set((state) => {
      state.payments.error = null;
    });
  },

  reset: () => {
    set((state) => {
      state.payments.bills = [];
      state.payments.skips = [];
      state.payments.monthGridsByLine = {};
      state.payments.uncoveredMonthsByLine = {};
      state.payments.paidMonthsByLine = {};
      state.payments.customerStatuses = new Map();
      state.payments.billsCustomerId = null;
      state.payments.loading = false;
      state.payments.loadingSkip = false;
      state.payments.error = null;
    });
  },
});
