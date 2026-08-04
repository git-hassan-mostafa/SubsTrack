import type { StateCreator } from 'zustand';
import type { TenantSetting, UnpaidStartRule } from '@/src/core/types';
// Deep import (not the module barrel) — the barrel re-exports screens.
import tenantSettingService from '@/src/modules/admin/tenant-settings/services/TenantSettingService';
import type { GlobalState } from '@/src/state/globalStore';

export interface TenantSettingSlice {
  items: TenantSetting[];
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  getSettings: () => Promise<void>;
  setUnpaidStartRule: (rule: UnpaidStartRule) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createTenantSettingSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  TenantSettingSlice
> = (set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  saving: false,
  error: null,

  fetchSettings: async () => {
    set((state) => {
      state.tenantSettings.loading = true;
      state.tenantSettings.error = null;
    });
    try {
      const items = await tenantSettingService.getSettings();
      set((state) => {
        state.tenantSettings.items = items;
        state.tenantSettings.loaded = true;
        state.tenantSettings.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.tenantSettings.error = (e as Error).message;
        state.tenantSettings.loading = false;
      });
    }
  },

  // Guarded on the `loaded` flag, never items.length — a tenant that has never
  // saved a setting has zero rows and would otherwise re-query on every caller.
  getSettings: async () => {
    const { loaded, loading } = get().tenantSettings;
    if (loaded || loading) return;
    await get().tenantSettings.fetchSettings();
  },

  setUnpaidStartRule: async (rule) => {
    const tenantId = get().auth.user?.tenantId;
    if (!tenantId) return;
    set((state) => {
      state.tenantSettings.saving = true;
      state.tenantSettings.error = null;
    });
    try {
      const saved = await tenantSettingService.setUnpaidStartRule(tenantId, rule);
      set((state) => {
        const i = state.tenantSettings.items.findIndex((s) => s.key === saved.key);
        if (i >= 0) state.tenantSettings.items[i] = saved;
        else state.tenantSettings.items.push(saved);
        state.tenantSettings.saving = false;
      });
      // The rule changes which months read as unpaid, so every cached customer
      // badge is now stale — one call rebuilds them all.
      await get().payments.fetchCustomerStatuses(get().customers.items);
    } catch (e) {
      set((state) => {
        state.tenantSettings.error = (e as Error).message;
        state.tenantSettings.saving = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.tenantSettings.error = null;
    }),

  reset: () =>
    set((state) => {
      state.tenantSettings.items = [];
      state.tenantSettings.loaded = false;
      state.tenantSettings.loading = false;
      state.tenantSettings.saving = false;
      state.tenantSettings.error = null;
    }),
});
