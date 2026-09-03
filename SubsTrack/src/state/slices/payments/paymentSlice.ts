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
  /** Whose bills are in the store — the "grids may be derived" signal (#130). */
  billsCustomerId: string | null;
  loading: boolean;
  loadingSkip: boolean;
  error: string | null;

  fetchCustomerStatuses: (customers: Customer[]) => Promise<void>;
  /**
   * Loads the customer's WHOLE bill history — never year-scoped, so navigating
   * years is a `buildGrids` re-derivation and not a query (#121). It stores the
   * rows only; the caller's year effect derives the grids from them.
   */
  fetchBills: (customerId: string) => Promise<void>;
  /**
   * Merges a just-recorded hand-over into the bills already in the store — no
   * re-query. The created `Collection` comes back with its items and each
   * item's charge, which is everything a month cell needs, so paying repaints
   * instantly instead of blinking through a reload.
   */
  applyCollection: (
    collection: Collection,
    /** -1 when that hand-over was VOIDED — the money comes back off its bills. */
    sign?: 1 | -1,
  ) => void;
  /** Rebuilds the viewed year's grids from what is already in the store. */
  buildGrids: (lines: CustomerPlan[], year: number) => void;
  /** Patches one customer's badge after a local mutation. */
  syncCustomerStatus: (customerId: string, lines: CustomerPlan[]) => Promise<void>;
  setMonthsSkipped: (
    inputs: SetSkipInput[],
    skipped: boolean,
    tenantId: string,
    userId: string | null,
  ) => Promise<void>;
  /**
   * Void a month bill and every payment on it. The ONE write here the store
   * cannot patch: a hand-over it undoes may also have settled OTHER months, and
   * the write deliberately never reads those back — so the caller re-reads.
   */
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

  setMonthsSkipped: async (inputs, skipped, tenantId, userId) => {
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
    // Not in the store (a bill from a customer that is not the viewed one) — the
    // order rule cannot be judged from here, so let the ledger write proceed.
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
