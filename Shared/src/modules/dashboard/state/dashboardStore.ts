import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { DashboardMetrics } from "@shared/core/types";
import dashboardService from "@shared/modules/dashboard/services/DashboardService";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import { parseUnpaidStartRule } from "@shared/modules/admin/tenant-settings/utils/unpaidStartRule";
import { TENANT_SETTING_KEYS } from "@shared/modules/admin/tenant-settings/utils/constants";
import { getStore } from "@shared/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

export interface DashboardState {
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
  fetchMetrics: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  immer((set) => ({
    metrics: null,
    loading: false,
    error: null,

    fetchMetrics: async () => {
      const epoch = currentDataEpoch();
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const user = getStore().getState().auth.user;
        const branchFilter = resolveBranchFilter(user);
        const isAdmin = user?.role === "admin" || user?.role === "superadmin";
        const viewer =
          isAdmin && user
            ? { id: user.id, role: user.role, branchId: user.branchId }
            : null;
        const unpaidRule = parseUnpaidStartRule(
          getStore()
            .getState()
            .tenantSettings.items.find(
              (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
            )?.value,
        );
        const metrics = await dashboardService.getMetrics(
          branchFilter,
          viewer,
          unpaidRule,
        );
        if (isStaleEpoch(epoch)) return;
        set((state) => {
          state.metrics = metrics;
          state.loading = false;
        });
      } catch (e) {
        if (isStaleEpoch(epoch)) return;
        set((state) => {
          state.error = (e as Error).message;
          state.loading = false;
        });
      }
    },

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    reset: () =>
      set((state) => {
        state.metrics = null;
        state.loading = false;
        state.error = null;
      }),
  })),
);
