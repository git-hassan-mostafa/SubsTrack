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
  debts: DebtsView | null;
  owed: OpenItem[];
  collections: CollectionListItem[];
  netByCustomer: Record<string, number>;
  owedVersion: number;
  loading: boolean;
  loadingOwed: boolean;
  loadingCollect: boolean;
  error: string | null;

  fetchDebts: (branchFilter: BranchFilter) => Promise<void>;
  fetchNetByCustomer: (branchFilter?: BranchFilter) => Promise<void>;
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

  collect: (input: CollectInput) => Promise<Collection | null>;
  voidCollection: (
    collection: Collection,
    voidedBy: string,
    reason: string | null,
  ) => Promise<Collection | null>;

  addManualCharge: (input: CreateManualChargeInput) => Promise<Charge | null>;
  updateManualCharge: (
    id: string,
    values: { description?: string; amount?: number; dueDate?: string; notes?: string | null },
  ) => Promise<Charge | null>;
  voidCharge: (id: string, voidedBy: string, reason: string | null) => Promise<boolean>;
  voidChargeWithPayments: (
    id: string,
    voidedBy: string,
    reason: string | null,
  ) => Promise<boolean>;
  writeOffCharge: (id: string, writtenOffBy: string, reason: string | null) => Promise<boolean>;

  markOwedChanged: () => void;

  clearError: () => void;
  reset: () => void;
}

export const createLedgerSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  LedgerSlice
> = (set, get) => {
  /**
   * Run a write, surface its error, and report whether it succeeded.
   *
   * Every write that goes through here moves a bill or the cash on one, so a
   * success also bumps `owedVersion` — one place, instead of remembering it at
   * seven call sites.
   */
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
        state.ledger.owedVersion += 1;
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
    netByCustomer: {},
    owedVersion: 0,
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
          state.ledger.netByCustomer = netMap(debts);
          state.ledger.loading = false;
        });
      } catch (e) {
        set((state) => {
          state.ledger.error = e instanceof Error ? e.message : String(e);
          state.ledger.loading = false;
        });
      }
    },

    fetchNetByCustomer: async (branchFilter = null) => {
      try {
        const debts = await ledgerService.getDebtsView(branchFilter);
        set((state) => {
          state.ledger.netByCustomer = netMap(debts);
        });
      } catch {
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
        get().ledger.clearOwed();
        get().sales.applyCollection(collection);
        return collection;
      }),

    voidCollection: async (collection, voidedBy, reason) => {
      const result = await run("loading", () =>
        collectionService.voidCollection(collection.id, voidedBy, reason),
      );
      if (result === null) return null;
      get().sales.applyCollection(collection, -1);
      return {
        ...collection,
        voidedAt: result.voidedAt,
        voidedBy: result.voidedBy,
        voidReason: result.voidReason,
      };
    },

    addManualCharge: (input) => run("loading", () => chargeService.addManualCharge(input)),

    updateManualCharge: (id, values) =>
      run("loading", () => chargeService.updateManualCharge(id, values)),

    voidCharge: async (id, voidedBy, reason) => {
      const result = await run("loading", () => chargeService.voidCharge(id, voidedBy, reason));
      return result !== null;
    },

    voidChargeWithPayments: async (id, voidedBy, reason) => {
      const result = await run("loading", () =>
        chargeService.voidChargeWithPayments(id, voidedBy, reason),
      );
      if (result !== null) get().ledger.clearOwed();
      return result !== null;
    },

    writeOffCharge: async (id, writtenOffBy, reason) => {
      const result = await run("loading", () =>
        chargeService.writeOff(id, writtenOffBy, reason),
      );
      return result !== null;
    },

    markOwedChanged: () => {
      set((state) => {
        state.ledger.owedVersion += 1;
      });
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
        state.ledger.netByCustomer = {};
        state.ledger.loading = false;
        state.ledger.loadingOwed = false;
        state.ledger.loadingCollect = false;
        state.ledger.error = null;
      });
    },
  };
};

/** Only DEBT counts toward the badge — a plain unpaid month is the grid's job. */
function netMap(view: DebtsView): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of view.customers) map[c.customerId] = c.debtUsd;
  return map;
}

export type { AllocationLine };
