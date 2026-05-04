import { create } from 'zustand';
import type { Plan } from '@/src/core/types';
import { PlanService } from '../services/PlanService';

interface PlansState {
  plans: Plan[];
  loading: boolean;
  error: string | null;
  fetchPlans: () => Promise<void>;
  createPlan: (data: { name: string; isCustomPrice: boolean; price: number | null }, tenantId: string) => Promise<void>;
  updatePlan: (id: string, data: { name: string; isCustomPrice: boolean; price: number | null }) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const planService = new PlanService();

export const usePlanStore = create<PlansState>((set, get) => ({
  plans: [],
  loading: false,
  error: null,

  fetchPlans: async () => {
    set({ loading: true, error: null });
    try {
      const plans = await planService.getPlans();
      set({ plans, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createPlan: async (data, tenantId) => {
    set({ loading: true, error: null });
    try {
      const plan = await planService.createPlan(data, tenantId);
      set((state) => ({ plans: [...state.plans, plan], loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updatePlan: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await planService.updatePlan(id, data);
      set((state) => ({
        plans: state.plans.map((p) => (p.id === id ? updated : p)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deletePlan: async (id) => {
    set({ loading: true, error: null });
    try {
      await planService.deletePlan(id);
      set((state) => ({ plans: state.plans.filter((p) => p.id !== id), loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set({ plans: [], loading: false, error: null }),
}));
