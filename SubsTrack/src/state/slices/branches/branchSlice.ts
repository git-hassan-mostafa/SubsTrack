import type { StateCreator } from "zustand";
import type { Branch, TierPlan, TenantUsage } from "@/src/core/types";
import {
  BranchService,
  type BranchInput,
} from "@/src/modules/branches/services/BranchService";
import { TierLimitError } from "@/src/modules/subscription/services/TierService";
import type { TierLimitErrorPayload } from "@/src/modules/subscription/components/UpgradePromptModal";
import type { GlobalState } from "@/src/state/globalStore";

const branchService = new BranchService();

export interface BranchSlice {
  items: Branch[];
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
  deleteBranch: (id: string) => Promise<"hard" | "soft" | null>;
  reactivateBranch: (id: string) => Promise<void>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createBranchSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  BranchSlice
> = (set, get) => ({
  items: [],
  loading: false,
  error: null,
  tierLimitError: null,

  getBranches: async () => {
    if (get().branches.items.length > 0) return;
    await get().branches.fetchBranches();
  },

  fetchBranches: async () => {
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
    });
    try {
      const items = await branchService.getBranches();
      set((state) => {
        state.branches.items = items;
        state.branches.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
    }
  },

  createBranch: async (data, tenantId, tier, usage) => {
    if (get().branches.loading) return;
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
      state.branches.tierLimitError = null;
    });
    try {
      const branch = await branchService.createBranch(
        data,
        tenantId,
        tier,
        usage,
      );
      set((state) => {
        state.branches.items.push(branch);
        state.branches.loading = false;
      });
      void get().subscription.refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set((state) => {
          state.branches.tierLimitError = {
            resource: e.resource,
            limit: e.limit,
            tierCode: e.tierCode,
          };
          state.branches.loading = false;
        });
      } else {
        set((state) => {
          state.branches.error = (e as Error).message;
          state.branches.loading = false;
        });
      }
    }
  },

  updateBranch: async (id, data) => {
    if (get().branches.loading) return;
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
    });
    try {
      const updated = await branchService.updateBranch(id, data);
      set((state) => {
        const i = state.branches.items.findIndex((b) => b.id === id);
        if (i !== -1) state.branches.items[i] = updated;
        state.branches.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
    }
  },

  deleteBranch: async (id) => {
    if (get().branches.loading) return null;
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
    });
    try {
      const mode = await branchService.deleteBranch(id);
      if (mode === "hard") {
        set((state) => {
          state.branches.items = state.branches.items.filter(
            (b) => b.id !== id,
          );
          state.branches.loading = false;
        });
      } else {
        set((state) => {
          const i = state.branches.items.findIndex((b) => b.id === id);
          if (i !== -1) state.branches.items[i].active = false;
          state.branches.loading = false;
        });
      }
      void get().subscription.refreshUsage();
      return mode;
    } catch (e) {
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
      return null;
    }
  },

  reactivateBranch: async (id) => {
    if (get().branches.loading) return;
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
    });
    try {
      const updated = await branchService.reactivateBranch(id);
      set((state) => {
        const i = state.branches.items.findIndex((b) => b.id === id);
        if (i !== -1) state.branches.items[i] = updated;
        state.branches.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.branches.error = null;
    }),
  clearTierLimitError: () =>
    set((state) => {
      state.branches.tierLimitError = null;
    }),
  reset: () =>
    set((state) => {
      state.branches.items = [];
      state.branches.loading = false;
      state.branches.error = null;
      state.branches.tierLimitError = null;
    }),
});
