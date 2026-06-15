import type { StateCreator } from 'zustand';
import type { AppOption } from '@/src/core/types';
import { optionService } from '@/src/modules/options';
import type { GlobalState } from '@/src/state/globalStore';

export interface OptionSlice {
  items: AppOption[];
  loading: boolean;
  error: string | null;
  fetchOptions: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const createOptionSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  OptionSlice
> = (set) => ({
  items: [],
  loading: false,
  error: null,

  fetchOptions: async () => {
    set((state) => {
      state.options.loading = true;
      state.options.error = null;
    });
    try {
      const items = await optionService.getOptions();
      set((state) => {
        state.options.items = items;
        state.options.loading = false;
      });
    } catch (e) {
      set((state) => {
        state.options.error = (e as Error).message;
        state.options.loading = false;
      });
    }
  },

  clearError: () =>
    set((state) => {
      state.options.error = null;
    }),

  reset: () =>
    set((state) => {
      state.options.items = [];
      state.options.loading = false;
      state.options.error = null;
    }),
});
