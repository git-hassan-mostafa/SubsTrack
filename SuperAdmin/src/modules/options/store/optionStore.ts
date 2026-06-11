import { create } from "zustand";
import type { AppOption } from "@/src/core/types";
import { OptionService, type OptionInput } from "../services/OptionService";

const service = new OptionService();

interface OptionState {
  options: AppOption[];
  loading: boolean;
  error: string | null;
  fetchOptions: () => Promise<void>;
  createOption: (data: OptionInput) => Promise<boolean>;
  updateOption: (id: string, data: OptionInput) => Promise<boolean>;
  deleteOption: (id: string) => Promise<boolean>;
  clearError: () => void;
}

export const useOptionStore = create<OptionState>((set) => ({
  options: [],
  loading: false,
  error: null,

  fetchOptions: async () => {
    set({ loading: true, error: null });
    try {
      const options = await service.getOptions();
      set({ options, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createOption: async (data) => {
    set({ loading: true, error: null });
    try {
      const created = await service.createOption(data);
      set((state) => ({
        options: [...state.options, created].sort((a, b) =>
          a.key.localeCompare(b.key),
        ),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  updateOption: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await service.updateOption(id, data);
      set((state) => ({
        options: state.options.map((o) => (o.id === id ? updated : o)),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  deleteOption: async (id) => {
    set({ loading: true, error: null });
    try {
      await service.deleteOption(id);
      set((state) => ({
        options: state.options.filter((o) => o.id !== id),
        loading: false,
      }));
      return true;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
