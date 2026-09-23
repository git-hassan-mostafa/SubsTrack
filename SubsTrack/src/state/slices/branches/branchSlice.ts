import type { StateCreator } from "zustand";
import type { Branch } from "@/src/core/types";
import { branchService, type BranchInput } from "@/src/modules/admin/branches";
import type { GlobalState } from "@/src/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@/src/shared/lib/dataEpoch";

export interface BranchSlice {
  items: Branch[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  getBranches: () => Promise<void>;
  fetchBranches: () => Promise<void>;
  createBranch: (data: BranchInput, tenantId: string) => Promise<void>;
  updateBranch: (id: string, data: BranchInput) => Promise<void>;
  deleteBranch: (id: string) => Promise<"hard" | "soft" | null>;
  bulkDeleteBranches: (ids: string[]) => Promise<boolean>;
  reactivateBranch: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createBranchSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  BranchSlice
> = (set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  error: null,

  getBranches: async () => {
    const { loaded, loading } = get().branches;
    if (loaded || loading) return;
    await get().branches.fetchBranches();
  },

  fetchBranches: async () => {
    const epoch = currentDataEpoch();
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
    });
    try {
      const items = await branchService.getBranches();
      if (isStaleEpoch(epoch)) return;
      set((state) => {
        state.branches.items = items;
        state.branches.loaded = true;
        state.branches.loading = false;
      });
    } catch (e) {
      if (isStaleEpoch(epoch)) return;
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
    }
  },

  createBranch: async (data, tenantId) => {
    if (get().branches.loading) return;
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
    });
    try {
      const branch = await branchService.createBranch(data, tenantId);
      set((state) => {
        state.branches.items.push(branch);
        state.branches.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
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
      return mode;
    } catch (e) {
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
      return null;
    }
  },

  bulkDeleteBranches: async (ids) => {
    if (ids.length === 0) return true;
    if (get().branches.loading) return false;
    set((state) => {
      state.branches.loading = true;
      state.branches.error = null;
    });
    try {
      const { hard, soft } = await branchService.deleteManyBranches(ids);
      set((state) => {
        const removed = new Set(hard);
        const softened = new Set(soft);
        state.branches.items = state.branches.items.filter(
          (b) => !removed.has(b.id),
        );
        for (const b of state.branches.items) {
          if (softened.has(b.id)) b.active = false;
        }
        state.branches.loading = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.branches.error = (e as Error).message;
        state.branches.loading = false;
      });
      return false;
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
  reset: () =>
    set((state) => {
      state.branches.items = [];
      state.branches.loaded = false;
      state.branches.loading = false;
      state.branches.error = null;
    }),
});
