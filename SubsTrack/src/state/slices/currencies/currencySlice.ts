import type { StateCreator } from 'zustand';
import type { Currency, TierPlan } from '@/src/core/types';
import { CurrencyService, type CurrencyInput } from '@/src/modules/currencies/services/CurrencyService';
import { TierLimitError } from '@/src/modules/subscription/services/TierService';
import type { TierLimitErrorPayload } from '@/src/modules/subscription/components/UpgradePromptModal';
import type { GlobalState } from '@/src/state/globalStore';

const currencyService = new CurrencyService();

export interface CurrencySlice {
  items: Currency[];
  loading: boolean;
  error: string | null;
  tierLimitError: TierLimitErrorPayload | null;
  getCurrencies: () => Promise<void>;
  fetchCurrencies: () => Promise<void>;
  createCurrency: (data: CurrencyInput, tenantId: string, tier: TierPlan) => Promise<void>;
  updateCurrency: (id: string, data: CurrencyInput) => Promise<void>;
  deleteCurrency: (id: string) => Promise<'hard' | 'soft' | null>;
  reactivateCurrency: (id: string) => Promise<void>;
  clearError: () => void;
  clearTierLimitError: () => void;
  reset: () => void;
}

export const createCurrencySlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  CurrencySlice
> = (set, get) => ({
  items: [],
  loading: false,
  error: null,
  tierLimitError: null,

  getCurrencies: async () => {
    if (get().currencies.items.length > 0) return;
    await get().currencies.fetchCurrencies();
  },

  fetchCurrencies: async () => {
    set((state) => {
      state.currencies.loading = true;
      state.currencies.error = null;
    });
    try {
      const items = await currencyService.getCurrencies();
      set((state) => {
        state.currencies.items = items;
        state.currencies.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.currencies.error = (e as Error).message;
        state.currencies.loading = false;
      });
    }
  },

  createCurrency: async (data, tenantId, tier) => {
    if (get().currencies.loading) return;
    set((state) => {
      state.currencies.loading = true;
      state.currencies.error = null;
      state.currencies.tierLimitError = null;
    });
    try {
      const currency = await currencyService.createCurrency(data, tenantId, tier);
      set((state) => {
        state.currencies.items.push(currency);
        state.currencies.loading = false;
      });
      void get().subscription.refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set((state) => {
          state.currencies.tierLimitError = {
            resource: e.resource,
            limit: e.limit,
            tierCode: e.tierCode,
          };
          state.currencies.loading = false;
        });
      } else {
        set((state) => {
          state.currencies.error = (e as Error).message;
          state.currencies.loading = false;
        });
      }
    }
  },

  updateCurrency: async (id, data) => {
    if (get().currencies.loading) return;
    set((state) => {
      state.currencies.loading = true;
      state.currencies.error = null;
    });
    try {
      const updated = await currencyService.updateCurrency(id, data);
      set((state) => {
        const i = state.currencies.items.findIndex((c) => c.id === id);
        if (i !== -1) state.currencies.items[i] = updated;
        state.currencies.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.currencies.error = (e as Error).message;
        state.currencies.loading = false;
      });
    }
  },

  deleteCurrency: async (id) => {
    if (get().currencies.loading) return null;
    set((state) => {
      state.currencies.loading = true;
      state.currencies.error = null;
    });
    try {
      const mode = await currencyService.deleteCurrency(id);
      if (mode === 'hard') {
        set((state) => {
          state.currencies.items = state.currencies.items.filter((c) => c.id !== id);
          state.currencies.loading = false;
        });
      } else {
        set((state) => {
          const i = state.currencies.items.findIndex((c) => c.id === id);
          if (i !== -1) state.currencies.items[i].active = false;
          state.currencies.loading = false;
        });
      }
      void get().subscription.refreshUsage();
      return mode;
    } catch (e) {
      set((state) => {
        state.currencies.error = (e as Error).message;
        state.currencies.loading = false;
      });
      return null;
    }
  },

  reactivateCurrency: async (id) => {
    if (get().currencies.loading) return;
    set((state) => {
      state.currencies.loading = true;
      state.currencies.error = null;
    });
    try {
      const updated = await currencyService.reactivateCurrency(id);
      set((state) => {
        const i = state.currencies.items.findIndex((c) => c.id === id);
        if (i !== -1) state.currencies.items[i] = updated;
        state.currencies.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.currencies.error = (e as Error).message;
        state.currencies.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.currencies.error = null;
    }),
  clearTierLimitError: () =>
    set((state) => {
      state.currencies.tierLimitError = null;
    }),
  reset: () =>
    set((state) => {
      state.currencies.items = [];
      state.currencies.loading = false;
      state.currencies.error = null;
      state.currencies.tierLimitError = null;
    }),
});
