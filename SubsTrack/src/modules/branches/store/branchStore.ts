import { create } from 'zustand';
import type { Branch, TierPlan, TenantUsage } from '@/src/core/types';
import { BranchService, type BranchInput } from '../services/BranchService';
import { useSubscriptionStore } from '@/src/modules/subscription/store/subscriptionStore';
import { TierLimitError } from '@/src/modules/subscription/services/TierService';
import type { TierLimitErrorPayload } from '@/src/modules/subscription/components/UpgradePromptModal';

const branchService = new BranchService();

interface BranchesState {
  branches: Branch[];
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getBranches: () => Promise<void>;
  fetchBranches: () => Promise<void>;
  createBranch: (
    data: BranchInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ) => Promise<void>;
  updateBranch: (id: string, data: BranchInput) => Promise<void>;
  deleteBranch: (id: string) => Promise<'hard' | 'soft' | null>;
  reactivateBranch: (id: string) => Promise<void>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const useBranchStore = create<BranchesState>((set, get) => ({
  branches: [],
  loading: false,
  error: null,
  tierLimitError: null,

  getBranches: async () => {
    if (get().branches.length > 0) return;
    await get().fetchBranches();
  },

  fetchBranches: async () => {
    set({ loading: true, error: null });
    try {
      const branches = await branchService.getBranches();
      set({ branches, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createBranch: async (data, tenantId, tier, usage) => {
    if (get().loading) return;
    set({ loading: true, error: null, tierLimitError: null });
    try {
      const branch = await branchService.createBranch(data, tenantId, tier, usage);
      set((state) => ({ branches: [...state.branches, branch], loading: false }));
      void useSubscriptionStore.getState().refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set({
          tierLimitError: { resource: e.resource, limit: e.limit, tierCode: e.tierCode },
          loading: false,
        });
      } else {
        set({ error: (e as Error).message, loading: false });
      }
    }
  },

  updateBranch: async (id, data) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const updated = await branchService.updateBranch(id, data);
      set((state) => ({
        branches: state.branches.map((b) => (b.id === id ? updated : b)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deleteBranch: async (id) => {
    if (get().loading) return null;
    set({ loading: true, error: null });
    try {
      const mode = await branchService.deleteBranch(id);
      if (mode === 'hard') {
        set((state) => ({
          branches: state.branches.filter((b) => b.id !== id),
          loading: false,
        }));
      } else {
        set((state) => ({
          branches: state.branches.map((b) => (b.id === id ? { ...b, active: false } : b)),
          loading: false,
        }));
      }
      return mode;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return null;
    }
  },

  reactivateBranch: async (id) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const updated = await branchService.reactivateBranch(id);
      set((state) => ({
        branches: state.branches.map((b) => (b.id === id ? updated : b)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  clearTierLimitError: () => set({ tierLimitError: null }),
  reset: () => set({ branches: [], loading: false, error: null, tierLimitError: null }),
}));
