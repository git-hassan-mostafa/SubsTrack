import type { StateCreator } from 'zustand';
import type { DashboardMetrics } from '@/src/core/types';
import { dashboardService } from '@/src/modules/dashboard';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import type { GlobalState } from '@/src/state/globalStore';

export interface DashboardSlice {
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
  getMetrics: () => Promise<void>;
  fetchMetrics: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createDashboardSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  DashboardSlice
> = (set, get) => ({
  metrics: null,
  loading: false,
  error: null,

  getMetrics: async () => {
    if (get().dashboard.metrics) return;
    await get().dashboard.fetchMetrics();
  },

  fetchMetrics: async () => {
    set((state) => {
      state.dashboard.loading = true;
      state.dashboard.error = null;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const metrics = await dashboardService.getMetrics(branchFilter);
      set((state) => {
        state.dashboard.metrics = metrics;
        state.dashboard.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.dashboard.error = (e as Error).message;
        state.dashboard.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.dashboard.error = null;
    }),

  reset: () =>
    set((state) => {
      state.dashboard.metrics = null;
      state.dashboard.loading = false;
      state.dashboard.error = null;
    }),
});
