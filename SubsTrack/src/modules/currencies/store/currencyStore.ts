import { create } from 'zustand';
import type { Currency } from '@/src/core/types';
import { CurrencyService, type CurrencyInput } from '../services/CurrencyService';

const currencyService = new CurrencyService();

interface CurrenciesState {
  currencies: Currency[];
  loading: boolean;
  error: string | null;
  getCurrencies: () => Promise<void>;
  fetchCurrencies: () => Promise<void>;
  createCurrency: (data: CurrencyInput, tenantId: string) => Promise<void>;
  updateCurrency: (id: string, data: CurrencyInput) => Promise<void>;
  deleteCurrency: (id: string) => Promise<'hard' | 'soft' | null>;
  reactivateCurrency: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useCurrencyStore = create<CurrenciesState>((set, get) => ({
  currencies: [],
  loading: false,
  error: null,

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

  createCurrency: async (data, tenantId) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const currency = await currencyService.createCurrency(data, tenantId);
      set((state) => ({ currencies: [...state.currencies, currency], loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
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
  reset: () => set({ currencies: [], loading: false, error: null }),
}));
