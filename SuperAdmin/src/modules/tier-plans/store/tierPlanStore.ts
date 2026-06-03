import { create } from 'zustand';
import type { TierPlan } from '@/src/core/types';
import { TierPlanService, type TierPlanInput } from '../services/TierPlanService';

const service = new TierPlanService();

interface TierPlanState {
  tierPlans: TierPlan[];
  loading: boolean;
  error: string | null;
  fetchTierPlans: () => Promise<void>;
  updateTierPlan: (id: string, data: TierPlanInput) => Promise<boolean>;
  clearError: () => void;
}

export const useTierPlanStore = create<TierPlanState>((set) => ({
  tierPlans: [],
  loading: false,
  error: null,

  fetchTierPlans: async () => {
    set({ loading: true, error: null });
    try {
      const tierPlans = await service.getTierPlans();
      set({ tierPlans, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateTierPlan: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await service.updateTierPlan(id, data);
      set((state) => ({
        tierPlans: state.tierPlans.map((t) => (t.id === id ? updated : t)),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
