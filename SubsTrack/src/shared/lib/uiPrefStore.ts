import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_KEYS, uiPrefPersistStorage } from './storage';
import type { BranchFilter } from '@/src/core/constants';

// Ad-hoc UI preferences shared across screens. Persisted to AsyncStorage
// so the user's last choices survive app restarts.
//
// The display currency is NOT here — it belongs to the organization, not the
// device, so it lives in `tenant_settings` (see useDisplayCurrencyId).
//
// lastUsedCurrencyId — the currency most recently typed into a CurrencyInput.
//   CurrencyInput defaults to this so staff don't re-pick on every form.
//   null = USD.
//
// currentBranchId — the branch filter for tenant-wide admins. Only consulted
// when the logged-in user has branchId === null (tenant-wide).
//   null                       = "All Branches" view (no filter)
//   BRANCH_FILTER_UNASSIGNED   = show only records with branch_id IS NULL
//   <UUID>                     = scope to that branch
// Branch-scoped users ignore this entirely (their branch_id is the only
// possible filter, enforced by RLS).

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
