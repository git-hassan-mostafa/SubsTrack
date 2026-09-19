import type { StateCreator } from "zustand";
import type { Plan } from "@/src/core/types";
import { planService } from "@/src/modules/admin/plans";
import { resolveBranchFilter } from "@/src/shared/lib/branchFilter";
import type { GlobalState } from "@/src/state/globalStore";

interface PlanInput {
  name: string;
  isCustomPrice: boolean;
  price: number | null;
  durationMonths: number;
  currencyId: string | null;
  branchId: string | null;
}

export interface PlanSlice {
  items: Plan[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  getPlans: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  createPlan: (data: PlanInput, tenantId: string) => Promise<void>;
  updatePlan: (id: string, data: PlanInput) => Promise<void>;
  deletePlan: (id: string) => Promise<boolean>;
  bulkDeletePlans: (ids: string[]) => Promise<boolean>;
  clearError: () => void;
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

  getPlans: async () => {
    const { loaded, loading } = get().plans;
    if (loaded || loading) return;
    await get().plans.fetchPlans();
  },

  fetchPlans: async () => {
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const items = await planService.getPlans(branchFilter);
      set((state) => {
        state.plans.items = items;
        state.plans.loaded = true;
        state.plans.loading = false;
      });
    } catch (e) {
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
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
    }
  },

  updatePlan: async (id, data) => {
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
    });
    try {
      const updated = await planService.updatePlan(id, data);
      set((state) => {
        const i = state.plans.items.findIndex((p) => p.id === id);
        if (i !== -1) state.plans.items[i] = updated;
        state.plans.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
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
  reset: () =>
    set((state) => {
      state.plans.items = [];
      state.plans.loaded = false;
      state.plans.loading = false;
      state.plans.error = null;
    }),
});
