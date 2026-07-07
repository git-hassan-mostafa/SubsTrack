import type { StateCreator } from 'zustand';
import type { DashboardMetrics, RevenuePoint } from '@/src/core/types';
import { dashboardService } from '@/src/modules/dashboard';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
import { getCurrentYearMonth } from '@/src/core/utils/date';
import type { GlobalState } from '@/src/state/globalStore';

export interface DashboardSlice {
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
  // The revenue trend shown may be navigated away from the current month; kept
  // separate from `metrics.revenueTrend` (the initial, current-month window) so
  // navigating the chart doesn't disturb the rest of the dashboard.
  trend: RevenuePoint[] | null;
  trendAnchor: { year: number; month: number } | null;
  trendLoading: boolean;
  fetchMetrics: () => Promise<void>;
  navigateTrend: (direction: 'prev' | 'next') => Promise<void>;
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
  trend: null,
  trendAnchor: null,
  trendLoading: false,

  fetchMetrics: async () => {
    set((state) => {
      state.dashboard.loading = true;
      state.dashboard.error = null;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const metrics = await dashboardService.getMetrics(branchFilter);
      const { year, month } = getCurrentYearMonth();
      set((state) => {
        state.dashboard.metrics = metrics;
        state.dashboard.trend = metrics.revenueTrend;
        state.dashboard.trendAnchor = { year, month };
        state.dashboard.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.dashboard.error = (e as Error).message;
        state.dashboard.loading = false;
      });
    }
  },

  navigateTrend: async (direction) => {
    const anchor = get().dashboard.trendAnchor;
    if (!anchor) return;
    const delta = direction === 'prev' ? -6 : 6;
    const total = anchor.year * 12 + (anchor.month - 1) + delta;
    const nextAnchor = { year: Math.floor(total / 12), month: (total % 12) + 1 };

    // Never navigate past the current month.
    const { year: curYear, month: curMonth } = getCurrentYearMonth();
    if (nextAnchor.year * 12 + nextAnchor.month > curYear * 12 + curMonth) return;

    set((state) => {
      state.dashboard.trendLoading = true;
    });
    try {
      const branchFilter = resolveBranchFilter(get().auth.user);
      const trend = await dashboardService.getRevenueTrend(
        nextAnchor.year,
        nextAnchor.month,
        branchFilter,
      );
      set((state) => {
        state.dashboard.trend = trend;
        state.dashboard.trendAnchor = nextAnchor;
        state.dashboard.trendLoading = false;
      });
    } catch (e) {
      set((state) => {
        state.dashboard.error = (e as Error).message;
        state.dashboard.trendLoading = false;
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
      state.dashboard.trend = null;
      state.dashboard.trendAnchor = null;
      state.dashboard.trendLoading = false;
    }),
});
