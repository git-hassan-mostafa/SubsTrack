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
  /** The viewed customer's month bills, paired with what has reached them. */
  bills: MonthBill[];
  skips: SkippedMonth[];
  // Per service line, for the viewed year.
  monthGridsByLine: Record<string, MonthEntry[]>;
  /**
   * Months with nothing collected — overdue OR merely not due yet. Wider than
   * "overdue" on purpose: paying ahead is fine, paying ahead OUT OF ORDER is
   * not, so this is what the pay gate compares against (#81b).
   */
  uncoveredMonthsByLine: Record<string, string[]>;
  /** Months currently paid — what the void-newest-first gate compares against. */
  paidMonthsByLine: Record<string, string[]>;
  /** The customer list's badge dataset. Absent = unknown, never "unpaid". */
  customerStatuses: Map<string, CustomerStatus>;
  loading: boolean;
  loadingSkip: boolean;
  error: string | null;

  fetchCustomerStatuses: (customers: Customer[]) => Promise<void>;
  /**
   * Always re-reads. There is deliberately no cached `getBills` companion: the
   * panel loads on FOCUS, and a cache keyed on the customer id would keep
   * serving the pre-sync grid after a month was paid or voided elsewhere.
   */
  fetchBills: (customerId: string, lines: CustomerPlan[], year: number) => Promise<void>;
  /**
   * Merges a just-recorded hand-over into the bills already in the store and
   * rebuilds the grids — no re-query. The created `Collection` comes back with
   * its items and each item's charge, which is everything a month cell needs,
   * so paying repaints instantly instead of blinking through a reload.
   */
  applyCollection: (collection: Collection, lines: CustomerPlan[], year: number) => void;
  /** Rebuilds the viewed year's grids from what is already in the store. */
  buildGrids: (lines: CustomerPlan[], year: number) => void;
  /** Patches one customer's badge after a local mutation. */
  syncCustomerStatus: (customerId: string, lines: CustomerPlan[]) => Promise<void>;
  setMonthsSkipped: (
    inputs: SetSkipInput[],
    skipped: boolean,
    tenantId: string,
    userId: string | null,
    lines: CustomerPlan[],
    year: number,
  ) => Promise<void>;
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
  loading: false,
  loadingSkip: false,
  error: null,

  fetchCustomerStatuses: async (customers) => {
    if (customers.length === 0) return;
    // One pass: every month bill and skip in the tenant, fetched once, then
    // grouped per customer. There is no second, slower scan to contradict it.
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

  fetchBills: async (customerId, lines, year) => {
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
    });
    try {
      const [bills, skips] = await Promise.all([
        chargeService.getMonthBillsForCustomer(customerId),
        skippedMonthService.getSkipsForCustomer(customerId),
      ]);
      const derived = buildGridsFor(lines, bills, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.bills = bills;
        state.payments.skips = skips;
        state.payments.monthGridsByLine = derived.grids;
        state.payments.uncoveredMonthsByLine = derived.uncoveredMonths;
        state.payments.paidMonthsByLine = derived.paidMonths;
        state.payments.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.payments.error = e instanceof Error ? e.message : String(e);
        state.payments.loading = false;
      });
    }
  },

  applyCollection: (collection, lines, year) => {
    const bills = mergeCollection(get().payments.bills, collection);
    const { skips } = get().payments;
    const derived = buildGridsFor(lines, bills, skips, year, getUnpaidRule(get));
    set((state) => {
      state.payments.bills = bills;
      state.payments.monthGridsByLine = derived.grids;
      state.payments.uncoveredMonthsByLine = derived.uncoveredMonths;
      state.payments.paidMonthsByLine = derived.paidMonths;
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
    // Valid because the fetch is not year-scoped — the slice holds that
    // customer's full history, which is what every count looks back over.
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

  setMonthsSkipped: async (inputs, skipped, tenantId, userId, lines, year) => {
    set((state) => {
      state.payments.loadingSkip = true;
      state.payments.error = null;
    });
    try {
      // An unskip hands the month back as UNPAID, so it follows the void rule:
      // refused while a later month of the same line is paid (#84).
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
      const { bills } = get().payments;
      const derived = buildGridsFor(lines, bills, skips, year, getUnpaidRule(get));
      set((state) => {
        state.payments.skips = skips;
        state.payments.monthGridsByLine = derived.grids;
        state.payments.uncoveredMonthsByLine = derived.uncoveredMonths;
        state.payments.paidMonthsByLine = derived.paidMonths;
        state.payments.loadingSkip = false;
      });
    } catch (e) {
      set((state) => {
        state.payments.error = e instanceof Error ? e.message : String(e);
        state.payments.loadingSkip = false;
      });
    }
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
      state.payments.loading = false;
      state.payments.loadingSkip = false;
      state.payments.error = null;
    });
  },
});
