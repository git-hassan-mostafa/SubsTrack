import type { StateCreator } from 'zustand';
import type { DashboardMetrics } from '@/src/core/types';
import { dashboardService } from '@/src/modules/dashboard';
import { resolveBranchFilter } from '@/src/shared/lib/branchFilter';
// Deep imports (not the module barrel) — the barrel re-exports screens.
import tenantSettingService from '@/src/modules/admin/tenant-settings/services/TenantSettingService';
import { TENANT_SETTING_KEYS } from '@/src/modules/admin/tenant-settings/utils/constants';
import type { GlobalState } from '@/src/state/globalStore';

export interface DashboardSlice {
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
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

  fetchMetrics: async () => {
    set((state) => {
      state.dashboard.loading = true;
      state.dashboard.error = null;
    });
    try {
      const user = get().auth.user;
      const branchFilter = resolveBranchFilter(user);
      // Only admins get the collector-wallet aggregate (admin overview). The
      // viewer decides which wallets they may see, so it goes in as one value.
      const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
      const viewer =
        isAdmin && user ? { id: user.id, role: user.role, branchId: user.branchId } : null;
      // Read at call time (never cached) so a change in Tenant Settings applies
      // to the very next refresh — same as the payment slice's month rules.
      const unpaidRule = tenantSettingService.parseUnpaidStartRule(
        get().tenantSettings.items.find(
          (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
        )?.value,
      );
      const metrics = await dashboardService.getMetrics(branchFilter, viewer, unpaidRule);
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
