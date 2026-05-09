import { create } from "zustand";
import type { DashboardMetrics } from "@/src/core/types";
import { DashboardService } from "../services/DashboardService";

interface DashboardState {
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
  getMetrics: () => Promise<void>;
  fetchMetrics: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const dashboardService = new DashboardService();

export const useDashboardStore = create<DashboardState>((set, get) => ({
  metrics: null,
  loading: false,
  error: null,
  getMetrics: async () => {
    if (!!get().metrics) return;
    await get().fetchMetrics();
  },
  fetchMetrics: async () => {
    set({ loading: true, error: null });

    try {
      const metrics = await dashboardService.getMetrics();
      set({ metrics, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set({ metrics: null, loading: false, error: null }),
}));
