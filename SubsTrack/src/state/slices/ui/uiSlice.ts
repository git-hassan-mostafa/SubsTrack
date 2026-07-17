import type { StateCreator } from 'zustand';
import type { GlobalState } from '@/src/state/globalStore';

// Generic slice for ephemeral, app-wide UI state (not persisted, not domain
// data). Home for cross-screen UI concerns that don't belong to any feature —
// today the quick-actions menu; add future transient UI state here too.
//
// (Persisted UI *preferences* — display currency, branch filter — live in the
// standalone `uiPrefStore`, kept out of the global store so nothing here ever
// accidentally persists.)

// The global "quick add" sheets the PageHeader 3-dot menu can launch on any
// screen. Each maps to a standalone form sheet hosted by QuickActionSheets.
export type QuickActionSheet = 'customer' | 'sale' | 'customDebt' | 'debtPayment';

export interface UiSlice {
  // Which quick-action sheet is open (null = none).
  openSheet: QuickActionSheet | null;
  openQuickAction: (sheet: QuickActionSheet) => void;
  closeQuickAction: () => void;
}

export const createUiSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  UiSlice
> = (set) => ({
  openSheet: null,

  openQuickAction: (sheet) =>
    set((s) => {
      s.ui.openSheet = sheet;
    }),

  closeQuickAction: () =>
    set((s) => {
      s.ui.openSheet = null;
    }),
});
