import { create } from "zustand";
import type { Plan, TierPlan, TenantUsage } from "@/src/core/types";
import { PlanService } from "../services/PlanService";
import { resolveBranchFilter } from "@/src/shared/lib/branchFilter";
import { useAuthStore } from "@/src/modules/auth/store/authStore";
import { useSubscriptionStore } from "@/src/modules/subscription/store/subscriptionStore";
import { TierLimitError } from "@/src/modules/subscription/services/TierService";
import type { TierLimitErrorPayload } from "@/src/modules/subscription/components/UpgradePromptModal";


const planService = new PlanService();

function handleTierError(set: (s: Partial<PlansState>) => void, e: unknown) {
  if (e instanceof TierLimitError) {
    set({
      tierLimitError: { resource: e.resource, limit: e.limit, tierCode: e.tierCode },
      loading: false,
    });
  } else {
    set({ error: (e as Error).message, loading: false });
  }
}

export const usePlanStore = create<PlansState>((set, get) => ({
  plans: [],
  loading: false,
  error: null,
  tierLimitError: null,

  getPlans: async () => {
    if (!!get().plans && get().plans.length > 0) return;
    await get().fetchPlans();
  },
  fetchPlans: async () => {
    set({ loading: true, error: null });
    try {
      const branchFilter = resolveBranchFilter(useAuthStore.getState().user);
      const plans = await planService.getPlans(branchFilter);
      set({ plans, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createPlan: async (data, tenantId, tier, usage) => {
    set({ loading: true, error: null, tierLimitError: null });
    try {
      const plan = await planService.createPlan(data, tenantId, tier, usage);
      set((state) => ({ plans: [...state.plans, plan], loading: false }));
      void useSubscriptionStore.getState().refreshUsage();
    } catch (e) {
      handleTierError(set, e);
    }
  },

  updatePlan: async (id, data, tier) => {
    set({ loading: true, error: null, tierLimitError: null });
    try {
      const updated = await planService.updatePlan(id, data, tier);
      set((state) => ({
        plans: state.plans.map((p) => (p.id === id ? updated : p)),
        loading: false,
      }));
    } catch (e) {
      handleTierError(set, e);
    }
  },

  deletePlan: async (id) => {
    set({ loading: true, error: null });
    try {
      await planService.deletePlan(id);
      set((state) => ({
        plans: state.plans.filter((p) => p.id !== id),
        loading: false,
      }));
      void useSubscriptionStore.getState().refreshUsage();
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  clearTierLimitError: () => set({ tierLimitError: null }),
  reset: () => set({ plans: [], loading: false, error: null, tierLimitError: null }),
}));


interface PlansState {
  plans: Plan[];
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getPlans: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  createPlan: (
    data: { name: string; isCustomPrice: boolean; price: number | null; durationMonths: number; currencyId: string | null; branchId: string | null },
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ) => Promise<void>;
  updatePlan: (
    id: string,
    data: { name: string; isCustomPrice: boolean; price: number | null; durationMonths: number; currencyId: string | null; branchId: string | null },
    tier: TierPlan,
  ) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}
