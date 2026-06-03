import { create } from 'zustand';
import type { Currency, TierPlan } from '@/src/core/types';
import { CurrencyService, type CurrencyInput } from '../services/CurrencyService';
import { useSubscriptionStore } from '@/src/modules/subscription/store/subscriptionStore';
import { TierLimitError } from '@/src/modules/subscription/services/TierService';
import type { TierLimitErrorPayload } from '@/src/modules/subscription/components/UpgradePromptModal';

const currencyService = new CurrencyService();

interface CurrenciesState {
  currencies: Currency[];
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

export const useCurrencyStore = create<CurrenciesState>((set, get) => ({
  currencies: [],
  loading: false,
  error: null,
  tierLimitError: null,

  getCurrencies: async () => {
    if (get().currencies.length > 0) return;
    await get().fetchCurrencies();
  },

  fetchCurrencies: async () => {
    set({ loading: true, error: null });
    try {
      const currencies = await currencyService.getCurrencies();
      set({ currencies, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createCurrency: async (data, tenantId, tier) => {
    if (get().loading) return;
    set({ loading: true, error: null, tierLimitError: null });
    try {
      const currency = await currencyService.createCurrency(data, tenantId, tier);
      set((state) => ({ currencies: [...state.currencies, currency], loading: false }));
      void useSubscriptionStore.getState().refreshUsage();
    } catch (e) {
      if (e instanceof TierLimitError) {
        set({
          tierLimitError: { resource: e.resource, limit: e.limit, tierCode: e.tierCode },
          loading: false,
        });
      } else {
        set({ error: (e as Error).message, loading: false });
      }
    }
  },

  updateCurrency: async (id, data) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const updated = await currencyService.updateCurrency(id, data);
      set((state) => ({
        currencies: state.currencies.map((c) => (c.id === id ? updated : c)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deleteCurrency: async (id) => {
    if (get().loading) return null;
    set({ loading: true, error: null });
    try {
      const mode = await currencyService.deleteCurrency(id);
      if (mode === 'hard') {
        set((state) => ({
          currencies: state.currencies.filter((c) => c.id !== id),
          loading: false,
        }));
      } else {
        set((state) => ({
          currencies: state.currencies.map((c) =>
            c.id === id ? { ...c, active: false } : c,
          ),
          loading: false,
        }));
      }
      return mode;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return null;
    }
  },

  reactivateCurrency: async (id) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const updated = await currencyService.reactivateCurrency(id);
      set((state) => ({
        currencies: state.currencies.map((c) => (c.id === id ? updated : c)),
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
  clearTierLimitError: () => set({ tierLimitError: null }),
  reset: () => set({ currencies: [], loading: false, error: null, tierLimitError: null }),
}));
