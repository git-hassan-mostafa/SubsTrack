import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, uiPrefPersistStorage } from './storage';
import type { BranchFilter } from '@/src/core/constants';


interface UiPrefState {
  lastUsedCurrencyId: string | null;
  setLastUsedCurrencyId: (id: string | null) => void;
  currentBranchId: BranchFilter;
  setCurrentBranchId: (id: BranchFilter) => void;
}

export const useUiPrefStore = create<UiPrefState>()(
  persist(
    (set) => ({
      lastUsedCurrencyId: null,
      setLastUsedCurrencyId: (id) => set({ lastUsedCurrencyId: id }),
      currentBranchId: null,
      setCurrentBranchId: (id) => set({ currentBranchId: id }),
    }),
    {
      name: STORAGE_KEYS.UI_PREF_STORE,
      storage: createJSONStorage(() => uiPrefPersistStorage),
      partialize: (state) => ({
        lastUsedCurrencyId: state.lastUsedCurrencyId,
        currentBranchId: state.currentBranchId,
      }),
    },
  ),
);
