import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { DashboardMetrics } from "@shared/core/types";
import dashboardService from "@shared/modules/dashboard/services/DashboardService";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import { parseUnpaidStartRule } from "@shared/modules/admin/tenant-settings/utils/unpaidStartRule";
import { TENANT_SETTING_KEYS } from "@shared/modules/admin/tenant-settings/utils/constants";
import { getStore } from "@shared/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";
import { isFreshRead, readStamp, type ReadStamp } from "@shared/shared/lib/readStamp";

export interface DashboardState {
  metrics: DashboardMetrics | null;
  stamp: ReadStamp | null;
  loading: boolean;
  error: string | null;
  fetchMetrics: () => Promise<void>;
  ensureMetrics: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const currentBranch = () => resolveBranchFilter(getStore().getState().auth.user);

const owedVersion = () => getStore().getState().ledger.owedVersion;

export const useDashboardStore = create<DashboardState>()(
  immer((set, get) => ({
    metrics: null,
    stamp: null,
    loading: false,
    error: null,

    fetchMetrics: async () => {
      const epoch = currentDataEpoch();
      const branchFilter = currentBranch();
      const stamp = readStamp(branchFilter, owedVersion());
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const user = getStore().getState().auth.user;
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
          state.stamp = stamp;
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

    ensureMetrics: async () => {
      if (isFreshRead(get().stamp, currentBranch(), owedVersion())) return;
      await get().fetchMetrics();
    },

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    reset: () =>
      set((state) => {
        state.metrics = null;
        state.stamp = null;
        state.loading = false;
        state.error = null;
      }),
  })),
);
