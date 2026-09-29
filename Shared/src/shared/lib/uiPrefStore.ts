import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { runtimeStorage } from "@shared/core/runtime/runtimeStorage";
import type { BranchFilter } from "@shared/core/constants";

const UI_PREF_STORE_KEY = "ui-pref-store";

interface UiPrefState {
  lastUsedCurrencyId: string | null;
  setLastUsedCurrencyId: (id: string | null) => void;
  currentBranchId: BranchFilter;
  setCurrentBranchId: (id: BranchFilter) => void;
  reset: () => void;
}

export const useUiPrefStore = create<UiPrefState>()(
  persist(
    (set) => ({
      lastUsedCurrencyId: null,
      setLastUsedCurrencyId: (id) => set({ lastUsedCurrencyId: id }),
      currentBranchId: null,
      setCurrentBranchId: (id) => set({ currentBranchId: id }),
      reset: () => set({ lastUsedCurrencyId: null, currentBranchId: null }),
    }),
    {
      name: UI_PREF_STORE_KEY,
      storage: createJSONStorage(() => runtimeStorage),
      partialize: (state) => ({
        lastUsedCurrencyId: state.lastUsedCurrencyId,
        currentBranchId: state.currentBranchId,
      }),
    },
  ),
);
