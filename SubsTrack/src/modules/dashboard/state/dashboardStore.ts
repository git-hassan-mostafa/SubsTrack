import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { DashboardMetrics } from '@/src/core/types';
import { dashboardService } from '@/src/modules/dashboard';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
// Deep imports (not the module barrel) — the barrel re-exports screens.
import tenantSettingService from '@/src/modules/admin/tenant-settings/services/TenantSettingService';
import { TENANT_SETTING_KEYS } from '@/src/modules/admin/tenant-settings/utils/constants';
import { getStore } from '@/src/state/globalStore';

// A MODULE store, not a global slice: only the dashboard screen reads it, and no
// slice reads it back. `auth` + `tenantSettings` are read across through the global
// store — the one allowed direction.
// See CLAUDE.md → State Management.

export interface DashboardState {
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
  fetchMetrics: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  immer((set, get) => ({
    metrics: null,
    loading: false,
    error: null,

    fetchMetrics: async () => {
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const user = getStore().getState().auth.user;
        const branchFilter = resolveBranchFilter(user);
        // Only admins get the collector-wallet aggregate (admin overview). The
        // viewer decides which wallets they may see, so it goes in as one value.
        const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
        const viewer =
          isAdmin && user ? { id: user.id, role: user.role, branchId: user.branchId } : null;
        // Read at call time (never cached) so a change in Tenant Settings applies
        // to the very next refresh — same as the payment slice's month rules.
        const unpaidRule = tenantSettingService.parseUnpaidStartRule(
          getStore().getState().tenantSettings.items.find(
            (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
          )?.value,
        );
        const metrics = await dashboardService.getMetrics(branchFilter, viewer, unpaidRule);
        set((state) => {
          state.metrics = metrics;
          state.loading = false;
        });
      } catch (e) {
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
