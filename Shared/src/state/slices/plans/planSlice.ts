import type { StateCreator } from "zustand";
import type { Plan, PlanPriceChange } from "@shared/core/types";
import planService from "@shared/modules/admin/plans/services/PlanService";
import {
  priceHistoryService,
  type UsageMonthPriceInput,
} from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import { planPriceChanged } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import type { PlanInput } from "@shared/modules/admin/plans/utils/types";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import type { GlobalState } from "@shared/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

export interface PlanSlice {
  items: Plan[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  pricesSaving: boolean;
  pricesError: string | null;
  getPlans: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  createPlan: (data: PlanInput, tenantId: string) => Promise<Plan | null>;
  updatePlan: (
    previous: Plan,
    data: PlanInput,
    priceFrom?: string,
  ) => Promise<Plan | null>;
  updatePriceStartFrom: (
    changeId: string,
    planId: string,
    fromMonth: string,
  ) => Promise<PlanPriceChange | null>;
  setUsageMonthPrices: (
    month: string,
    prices: UsageMonthPriceInput[],
  ) => Promise<PlanPriceChange[] | null>;
  deletePlan: (id: string) => Promise<boolean>;
  bulkDeletePlans: (ids: string[]) => Promise<boolean>;
  clearError: () => void;
  clearPricesError: () => void;
  reset: () => void;
}

export const createPlanSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  PlanSlice
> = (set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  error: null,
  pricesSaving: false,
  pricesError: null,

  getPlans: async () => {
    const { loaded, loading } = get().plans;
    if (loaded || loading) return;
    await get().plans.fetchPlans();
  },

  fetchPlans: async () => {
    const epoch = currentDataEpoch();
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const items = await planService.getPlans(branchFilter);
      if (isStaleEpoch(epoch)) return;
      set((state) => {
        state.plans.items = items;
        state.plans.loaded = true;
        state.plans.loading = false;
      });
    } catch (e) {
      if (isStaleEpoch(epoch)) return;
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
    }
  },

  createPlan: async (data, tenantId) => {
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
    });
    try {
      const plan = await planService.createPlan(data, tenantId);
      set((state) => {
        state.plans.items.push(plan);
        state.plans.loading = false;
      });
      return plan;
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
      return null;
    }
  },

  updatePlan: async (previous, data, priceFrom) => {
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
    });
    try {
      const updated = await planService.updatePlan(
        previous,
        data,
        priceFrom,
      );
      set((state) => {
        const i = state.plans.items.findIndex((p) => p.id === previous.id);
        if (i !== -1) state.plans.items[i] = updated;
        state.plans.loading = false;
      });
      if (planPriceChanged(previous, data)) {
        get().ledger.markOwedChanged();
      }
      return updated;
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
      return null;
    }
  },

  updatePriceStartFrom: async (changeId, planId, fromMonth) => {
    const updated = await priceHistoryService.updatePlanChangeFromMonth(
      changeId,
      planId,
      fromMonth,
    );
    get().ledger.markOwedChanged();
    return updated;
  },

  setUsageMonthPrices: async (month, prices) => {
    set((state) => {
      state.plans.pricesSaving = true;
      state.plans.pricesError = null;
    });
    try {
      const saved = await priceHistoryService.setUsageMonthPrices(month, prices);
      set((state) => {
        state.plans.pricesSaving = false;
      });
      get().ledger.markOwedChanged();
      return saved;
    } catch (e) {
      set((state) => {
        state.plans.pricesError = (e as Error).message;
        state.plans.pricesSaving = false;
      });
      return null;
    }
  },

  deletePlan: async (id) => {
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
    });
    try {
      await planService.deletePlan(id);
      set((state) => {
        state.plans.items = state.plans.items.filter((p) => p.id !== id);
        state.plans.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
      return false;
    }
  },

  bulkDeletePlans: async (ids) => {
    if (ids.length === 0) return true;
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
    });
    try {
      await planService.deleteManyPlans(ids);
      set((state) => {
        const removed = new Set(ids);
        state.plans.items = state.plans.items.filter((p) => !removed.has(p.id));
        state.plans.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
      return false;
    }
  },

  clearError: () =>
    set((state) => {
      state.plans.error = null;
    }),
  clearPricesError: () =>
    set((state) => {
      state.plans.pricesError = null;
    }),
  reset: () =>
    set((state) => {
      state.plans.items = [];
      state.plans.loaded = false;
      state.plans.loading = false;
      state.plans.error = null;
      state.plans.pricesSaving = false;
      state.plans.pricesError = null;
    }),
});
