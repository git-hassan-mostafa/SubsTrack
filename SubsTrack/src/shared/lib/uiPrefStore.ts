import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, uiPrefPersistStorage } from './storage';

// Ad-hoc UI preferences shared across screens. Persisted to AsyncStorage
// so the user's last choices survive app restarts.
//
// displayCurrencyId — the currency the user wants amounts displayed in.
//   null = USD (the base). Set from Tenant Settings.
//
// lastUsedCurrencyId — the currency most recently typed into a CurrencyInput.
//   CurrencyInput defaults to this so staff don't re-pick on every form.
//   null = USD.

interface UiPrefState {
  displayCurrencyId: string | null;
  setDisplayCurrencyId: (id: string | null) => void;
  lastUsedCurrencyId: string | null;
  setLastUsedCurrencyId: (id: string | null) => void;
}

export const useUiPrefStore = create<UiPrefState>()(
  persist(
    (set) => ({
      displayCurrencyId: null,
      setDisplayCurrencyId: (id) => set({ displayCurrencyId: id }),
      lastUsedCurrencyId: null,
      setLastUsedCurrencyId: (id) => set({ lastUsedCurrencyId: id }),
    }),
    {
      name: STORAGE_KEYS.UI_PREF_STORE,
      storage: createJSONStorage(() => uiPrefPersistStorage),
      partialize: (state) => ({
        displayCurrencyId: state.displayCurrencyId,
        lastUsedCurrencyId: state.lastUsedCurrencyId,
      }),
    },
  ),
);
