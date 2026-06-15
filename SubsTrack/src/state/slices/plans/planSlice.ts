import type { StateCreator } from 'zustand';
import type { Plan, TierPlan, TenantUsage } from '@/src/core/types';
import { planService } from '@/src/modules/plans';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { TierLimitError } from '@/src/modules/subscription';
import type { TierLimitErrorPayload } from '@/src/modules/subscription';
import type { GlobalState } from '@/src/state/globalStore';

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
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getPlans: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  createPlan: (data: PlanInput, tenantId: string, tier: TierPlan, usage: TenantUsage) => Promise<void>;
  updatePlan: (id: string, data: PlanInput, tier: TierPlan) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createPlanSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  PlanSlice
> = (set, get) => ({
  items: [],
  loading: false,
  error: null,
  tierLimitError: null,

  getPlans: async () => {
    if (get().plans.items.length > 0) return;
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
        state.plans.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
    }
  },

  createPlan: async (data, tenantId, tier, usage) => {
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
      state.plans.tierLimitError = null;
    });
    try {
      const plan = await planService.createPlan(data, tenantId, tier, usage);
      set((state) => {
        state.plans.items.push(plan);
        state.plans.loading = false;
      });
      void get().subscription.refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set((state) => {
          state.plans.tierLimitError = {
            resource: e.resource,
            limit: e.limit,
            tierCode: e.tierCode,
          };
          state.plans.loading = false;
        });
      } else {
        set((state) => {
          state.plans.error = (e as Error).message;
          state.plans.loading = false;
        });
      }
    }
  },

  updatePlan: async (id, data, tier) => {
    set((state) => {
      state.plans.loading = true;
      state.plans.error = null;
      state.plans.tierLimitError = null;
    });
    try {
      const updated = await planService.updatePlan(id, data, tier);
      set((state) => {
        const i = state.plans.items.findIndex((p) => p.id === id);
        if (i !== -1) state.plans.items[i] = updated;
        state.plans.loading = false;
      });
    } catch (e) {
      if (e instanceof TierLimitError) {
        set((state) => {
          state.plans.tierLimitError = {
            resource: e.resource,
            limit: e.limit,
            tierCode: e.tierCode,
          };
          state.plans.loading = false;
        });
      } else {
        set((state) => {
          state.plans.error = (e as Error).message;
          state.plans.loading = false;
        });
      }
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
      void get().subscription.refreshUsage();
    } catch (e) {
      set((state) => {
        state.plans.error = (e as Error).message;
        state.plans.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.plans.error = null;
    }),
  clearTierLimitError: () =>
    set((state) => {
      state.plans.tierLimitError = null;
    }),
  reset: () =>
    set((state) => {
      state.plans.items = [];
      state.plans.loading = false;
      state.plans.error = null;
      state.plans.tierLimitError = null;
    }),
});
