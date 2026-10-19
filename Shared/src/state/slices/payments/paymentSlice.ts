import type { StateCreator } from "zustand";
import type {
  Collection,
  Customer,
  CustomerPlan,
  CustomerStatus,
  MonthBill,
  MonthEntry,
  PriceHistory,
  SkippedMonth,
  UsageReading,
} from "@shared/core/types";
import paymentService from "@shared/modules/customer/customer-payments/services/PaymentService";
import skippedMonthService from "@shared/modules/customer/customer-payments/services/SkippedMonthService";
import type { SetSkipInput } from "@shared/modules/customer/customer-payments/services/SkippedMonthService";
import {
  usageReadingService,
  type SaveUsageInput,
} from "@shared/modules/customer/customer-payments/services/UsageReadingService";
import { usageByLineOf } from "@shared/modules/customer/customer-payments/utils/usageBill";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import { EMPTY_PRICE_HISTORY } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";
import type { GlobalState } from "@shared/state/globalStore";
import { buildGridsFor } from "./utils/buildGrids";
import { groupMonthsByLine } from "./utils/groupMonthsByLine";
import { mergeCollection } from "./utils/mergeCollection";
import { getUnpaidRule } from "./utils/unpaidRule";
import {
  buildCustomerStatus,
  getCustomerStatuses,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";

// The viewed customer's months only; money moves through the ledger slice.
export interface PaymentSlice {
  bills: MonthBill[];
  skips: SkippedMonth[];
  prices: PriceHistory;
  readings: UsageReading[];
  monthGridsByLine: Record<string, MonthEntry[]>;
  uncoveredMonthsByLine: Record<string, string[]>;
  paidMonthsByLine: Record<string, string[]>;
  customerStatuses: Map<string, CustomerStatus>;
  billsCustomerId: string | null;
  loading: boolean;
  loadingSkip: boolean;
  loadingReading: boolean;
  error: string | null;

  fetchCustomerStatuses: (customers: Customer[]) => Promise<void>;
  fetchBills: (customerId: string, lines: CustomerPlan[]) => Promise<void>;
  // No-op unless that hand-over belongs to the customer whose bills are loaded.
  applyCollection: (collection: Collection, sign?: 1 | -1) => void;
  buildGrids: (lines: CustomerPlan[], year: number) => void;
  syncCustomerStatus: (
    customerId: string,
    lines: CustomerPlan[],
  ) => Promise<void>;
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
  saveReading: (input: SaveUsageInput) => Promise<boolean>;
  removeReading: (reading: UsageReading, voidedBy: string) => Promise<boolean>;
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
  prices: EMPTY_PRICE_HISTORY,
  readings: [],
  monthGridsByLine: {},
  uncoveredMonthsByLine: {},
  paidMonthsByLine: {},
  customerStatuses: new Map(),
  billsCustomerId: null,
  loading: false,
  loadingSkip: false,
  loadingReading: false,
  error: null,

  fetchCustomerStatuses: async (customers) => {
    if (customers.length === 0) return;
    const epoch = currentDataEpoch();
    const lines = customers.flatMap((c) => c.customerPlans ?? []);
    const [billsByLine, skips, usageByLine] = await Promise.all([
      chargeService.getMonthBillsForLines(lines.map((l) => l.id)),
      skippedMonthService.getActiveSkips(),
      usageReadingService.getUsageByLine(lines),
    ]);
    if (isStaleEpoch(epoch)) return;
    const bills = [...billsByLine.values()].flat();
    set((state) => {
      state.payments.customerStatuses = getCustomerStatuses(
        customers,
        bills,
        skips,
        getUnpaidRule(get),
        usageByLine,
      );
    });
  },

  fetchBills: async (customerId, lines) => {
    const epoch = currentDataEpoch();
    set((state) => {
      state.payments.loading = true;
      state.payments.error = null;
    });
    try {
      const usageLineIds = lines.filter((l) => l.plan?.usage).map((l) => l.id);
      const [bills, skips, prices, readings] = await Promise.all([
        chargeService.getMonthBillsForCustomer(customerId),
        skippedMonthService.getSkipsForCustomer(customerId),
        priceHistoryService.getForLines(lines),
        usageReadingService.getForLines(usageLineIds),
      ]);
      if (isStaleEpoch(epoch)) return;
      set((state) => {
        state.payments.bills = bills;
        state.payments.skips = skips;
        state.payments.prices = prices;
        state.payments.readings = readings;
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
    const { billsCustomerId, bills } = get().payments;
    if (!billsCustomerId) return;
    if (collection.customerId && collection.customerId !== billsCustomerId)
      return;
    const merged = mergeCollection(bills, collection, sign);
    set((state) => {
      state.payments.bills = merged;
    });
  },

  buildGrids: (lines, year) => {
    const { bills, skips, readings, prices } = get().payments;
    const derived = buildGridsFor(
      lines,
      bills,
      skips,
      year,
      getUnpaidRule(get),
      usageByLineOf(lines, readings, prices),
    );
    set((state) => {
      state.payments.monthGridsByLine = derived.grids;
      state.payments.uncoveredMonthsByLine = derived.uncoveredMonths;
      state.payments.paidMonthsByLine = derived.paidMonths;
    });
  },

  syncCustomerStatus: async (customerId, lines) => {
    const [billsByLine, skips, usageByLine] = await Promise.all([
      chargeService.getMonthBillsForLines(lines.map((l) => l.id)),
      skippedMonthService.getSkipsForCustomer(customerId),
      usageReadingService.getUsageByLine(lines),
    ]);
    const bills = [...billsByLine.values()].flat();
    const status = buildCustomerStatus(
      lines,
      bills,
      skips,
      getUnpaidRule(get),
      usageByLine,
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
      const skips = await skippedMonthService.getSkipsForCustomer(
        inputs[0].customerId,
      );
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
    const ok = await get().ledger.voidChargeWithPayments(
      chargeId,
      voidedBy,
      reason,
    );
    return { ok, blockedBy: null };
  },

  saveReading: async (input) => {
    set((state) => {
      state.payments.loadingReading = true;
      state.payments.error = null;
    });
    try {
      const saved = await usageReadingService.save(input);
      const others = get().payments.readings.filter(
        (r) =>
          r.customerPlanId !== saved.customerPlanId ||
          r.billingMonth !== saved.billingMonth,
      );
      set((state) => {
        state.payments.readings = [...others, saved];
        state.payments.loadingReading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.payments.error = e instanceof Error ? e.message : String(e);
        state.payments.loadingReading = false;
      });
      return false;
    }
  },

  removeReading: async (reading, voidedBy) => {
    set((state) => {
      state.payments.loadingReading = true;
      state.payments.error = null;
    });
    try {
      await usageReadingService.remove(reading, voidedBy);
      const kept = get().payments.readings.filter((r) => r.id !== reading.id);
      set((state) => {
        state.payments.readings = kept;
        state.payments.loadingReading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.payments.error = e instanceof Error ? e.message : String(e);
        state.payments.loadingReading = false;
      });
      return false;
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
      state.payments.prices = EMPTY_PRICE_HISTORY;
      state.payments.readings = [];
      state.payments.monthGridsByLine = {};
      state.payments.uncoveredMonthsByLine = {};
      state.payments.paidMonthsByLine = {};
      state.payments.customerStatuses = new Map();
      state.payments.billsCustomerId = null;
      state.payments.loading = false;
      state.payments.loadingSkip = false;
      state.payments.loadingReading = false;
      state.payments.error = null;
    });
  },
});
