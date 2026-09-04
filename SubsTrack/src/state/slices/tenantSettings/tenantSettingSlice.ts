import type { StateCreator } from 'zustand';
import type { TenantSetting, UnpaidStartRule } from '@/src/core/types';
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
  setDisplayCurrencyId: (currencyId: string | null) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createTenantSettingSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  TenantSettingSlice
> = (set, get) => {
  // Shared write path for every setting: only the service call differs.
  // Returns false when nothing was saved, so callers can skip follow-up work.
  const save = async (
    call: (tenantId: string) => Promise<TenantSetting>,
  ): Promise<boolean> => {
    const tenantId = get().auth.user?.tenantId;
    if (!tenantId) return false;
    set((state) => {
      state.tenantSettings.saving = true;
      state.tenantSettings.error = null;
    });
    try {
      const saved = await call(tenantId);
      set((state) => {
        const i = state.tenantSettings.items.findIndex((s) => s.key === saved.key);
        if (i >= 0) state.tenantSettings.items[i] = saved;
        else state.tenantSettings.items.push(saved);
        state.tenantSettings.saving = false;
      });
      return true;
    } catch (e) {
      set((state) => {
        state.tenantSettings.error = (e as Error).message;
        state.tenantSettings.saving = false;
      });
      return false;
    }
  };

  return {
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

    getSettings: async () => {
      const { loaded, loading } = get().tenantSettings;
      if (loaded || loading) return;
      await get().tenantSettings.fetchSettings();
    },

    setUnpaidStartRule: async (rule) => {
      const ok = await save((tenantId) =>
        tenantSettingService.setUnpaidStartRule(tenantId, rule),
      );
      if (!ok) return;
      await get().payments.fetchCustomerStatuses(get().customers.items);
    },

    setDisplayCurrencyId: async (currencyId) => {
      await save((tenantId) =>
        tenantSettingService.setDisplayCurrencyId(tenantId, currencyId),
      );
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
  };
};
