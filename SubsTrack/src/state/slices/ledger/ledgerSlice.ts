import type { StateCreator } from "zustand";
import type {
  AllocationLine,
  Charge,
  Collection,
  CollectionListItem,
  Currency,
  Customer,
  CustomerPlan,
  DebtsView,
  OpenItem,
} from "@/src/core/types";
import type { BranchFilter } from "@/src/core/constants";
import {
  chargeService,
  collectionService,
  ledgerService,
  type CollectInput,
  type CreateManualChargeInput,
} from "@/src/modules/ledger";
import { skippedMonthService } from "@/src/modules/customer/customer-payments";
import tenantSettingService from "@/src/modules/admin/tenant-settings/services/TenantSettingService";
import { TENANT_SETTING_KEYS } from "@/src/modules/admin/tenant-settings/utils/constants";
import type { GlobalState } from "@/src/state/globalStore";

const getUnpaidRule = (get: () => GlobalState) =>
  tenantSettingService.parseUnpaidStartRule(
    get().tenantSettings.items.find(
      (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
    )?.value,
  );

/**
 * The money slice: what customers owe, and every hand-over of cash.
 *
 * This is the ONLY place a payment is written now — a month, a sale and a
 * custom fee are all settled by collecting, so there is one action instead of
 * the six create-payment variants the old payment slice carried.
 */
export interface LedgerSlice {
  /** The Debts screen for the active branch scope. */
  debts: DebtsView | null;
  /** Everything ONE customer owes, unpaid months included — the collect sheet. */
  owed: OpenItem[];
  /** The money-in history (all customers, one customer, or one wallet). */
  collections: CollectionListItem[];
  loading: boolean;
  loadingOwed: boolean;
  loadingCollect: boolean;
  error: string | null;

  fetchDebts: (branchFilter: BranchFilter) => Promise<void>;
  /** Loads what one customer owes, ready for the waterfall. */
  fetchOwed: (
    customer: Customer,
    lines: CustomerPlan[],
    currencies: Currency[],
  ) => Promise<void>;
  clearOwed: () => void;
  fetchCollections: (opts: {
    customerId?: string;
    heldByUserId?: string;
    branchFilter?: BranchFilter;
    limit?: number;
    offset?: number;
    searchTerm?: string;
  }) => Promise<void>;

  /**
   * Record one hand-over. Returns the created row so the caller can build a
   * WhatsApp receipt from the REAL record; null = the write failed, check
   * `error`.
   */
  collect: (input: CollectInput) => Promise<Collection | null>;
  voidCollection: (id: string, voidedBy: string, reason: string | null) => Promise<boolean>;

  addManualCharge: (input: CreateManualChargeInput) => Promise<Charge | null>;
  updateManualCharge: (
    id: string,
    values: { description?: string; amount?: number; dueDate?: string; notes?: string | null },
  ) => Promise<Charge | null>;
  voidCharge: (id: string, voidedBy: string, reason: string | null) => Promise<boolean>;
  /** He owes it and will not pay — leaves "still owed", kept as a loss. */
  writeOffCharge: (id: string, writtenOffBy: string, reason: string | null) => Promise<boolean>;

  clearError: () => void;
  reset: () => void;
}

export const createLedgerSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  LedgerSlice
> = (set, get) => {
  /** Run a write, surface its error, and report whether it succeeded. */
  const run = async <T,>(
    flag: "loading" | "loadingCollect",
    fn: () => Promise<T>,
  ): Promise<T | null> => {
    set((state) => {
      state.ledger[flag] = true;
      state.ledger.error = null;
    });
    try {
      const result = await fn();
      set((state) => {
        state.ledger[flag] = false;
      });
      return result;
    } catch (e) {
      set((state) => {
        state.ledger.error = e instanceof Error ? e.message : String(e);
        state.ledger[flag] = false;
      });
      return null;
    }
  };

  return {
    debts: null,
    owed: [],
    collections: [],
    loading: false,
    loadingOwed: false,
    loadingCollect: false,
    error: null,

    fetchDebts: async (branchFilter) => {
      set((state) => {
        state.ledger.loading = true;
        state.ledger.error = null;
      });
      try {
        const debts = await ledgerService.getDebtsView(branchFilter);
        set((state) => {
          state.ledger.debts = debts;
          state.ledger.loading = false;
        });
      } catch (e) {
        set((state) => {
          state.ledger.error = e instanceof Error ? e.message : String(e);
          state.ledger.loading = false;
        });
      }
    },

    fetchOwed: async (customer, lines, currencies) => {
      set((state) => {
        state.ledger.loadingOwed = true;
        state.ledger.error = null;
      });
      try {
        const skips = await skippedMonthService.getSkipsForCustomer(customer.id);
        const owed = await ledgerService.getOwed({
          customer,
          lines,
          skips,
          unpaidRule: getUnpaidRule(get),
          currencies,
        });
        set((state) => {
          state.ledger.owed = owed;
          state.ledger.loadingOwed = false;
        });
      } catch (e) {
        set((state) => {
          state.ledger.error = e instanceof Error ? e.message : String(e);
          state.ledger.loadingOwed = false;
        });
      }
    },

    clearOwed: () => {
      set((state) => {
        state.ledger.owed = [];
      });
    },

    fetchCollections: async (opts) => {
      set((state) => {
        state.ledger.loading = true;
        state.ledger.error = null;
      });
      try {
        const collections = await collectionService.getHistory(opts);
        set((state) => {
          state.ledger.collections = collections;
          state.ledger.loading = false;
        });
      } catch (e) {
        set((state) => {
          state.ledger.error = e instanceof Error ? e.message : String(e);
          state.ledger.loading = false;
        });
      }
    },

    collect: (input) =>
      run("loadingCollect", async () => {
        const collection = await collectionService.collect(input);
        // The bills this touched moved, so the grid and the badges are stale.
        get().ledger.clearOwed();
        return collection;
      }),

    voidCollection: async (id, voidedBy, reason) => {
      const result = await run("loading", () =>
        collectionService.voidCollection(id, voidedBy, reason),
      );
      return result !== null;
    },

    addManualCharge: (input) => run("loading", () => chargeService.addManualCharge(input)),

    updateManualCharge: (id, values) =>
      run("loading", () => chargeService.updateManualCharge(id, values)),

    voidCharge: async (id, voidedBy, reason) => {
      const result = await run("loading", () => chargeService.voidCharge(id, voidedBy, reason));
      return result !== null;
    },

    writeOffCharge: async (id, writtenOffBy, reason) => {
      const result = await run("loading", () =>
        chargeService.writeOff(id, writtenOffBy, reason),
      );
      return result !== null;
    },

    clearError: () => {
      set((state) => {
        state.ledger.error = null;
      });
    },

    reset: () => {
      set((state) => {
        state.ledger.debts = null;
        state.ledger.owed = [];
        state.ledger.collections = [];
        state.ledger.loading = false;
        state.ledger.loadingOwed = false;
        state.ledger.loadingCollect = false;
        state.ledger.error = null;
      });
    },
  };
};

/** Re-exported for the collect sheet's live split preview. */
export type { AllocationLine };
