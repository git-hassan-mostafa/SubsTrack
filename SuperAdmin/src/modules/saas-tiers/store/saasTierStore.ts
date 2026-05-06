import { create } from 'zustand';
import type { SaasTier } from '@/src/core/types';
import { SaasTierService, type SaasTierInput } from '../services/SaasTierService';

interface SaasTierState {
  saasTiers: SaasTier[];
  loading: boolean;
  error: string | null;
  fetchSaasTiers: () => Promise<void>;
  createSaasTier: (data: SaasTierInput & { tenantId: string }) => Promise<boolean>;
  updateSaasTier: (id: string, data: SaasTierInput) => Promise<boolean>;
  deleteSaasTier: (id: string) => Promise<void>;
  clearError: () => void;
}

const saasTierService = new SaasTierService();

export const useSaasTierStore = create<SaasTierState>((set) => ({
  saasTiers: [],
  loading: false,
  error: null,

  fetchSaasTiers: async () => {
    set({ loading: true, error: null });
    try {
      const saasTiers = await saasTierService.getSaasTiers();
      set({ saasTiers, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createSaasTier: async (data) => {
    set({ loading: true, error: null });
    try {
      const tier = await saasTierService.createSaasTier(data);
      set((state) => ({ saasTiers: [...state.saasTiers, tier], loading: false }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  updateSaasTier: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await saasTierService.updateSaasTier(id, data);
      set((state) => ({
        saasTiers: state.saasTiers.map((t) => (t.id === id ? updated : t)),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  deleteSaasTier: async (id) => {
    set({ loading: true, error: null });
    try {
      await saasTierService.deleteSaasTier(id);
      set((state) => ({ saasTiers: state.saasTiers.filter((t) => t.id !== id), loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
