import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// Ephemeral, app-wide UI state (not persisted, not domain data). A standalone
// store rather than a global slice: no slice reads it, and it has no owning
// module — `PageHeader` flips it on every screen and `QuickActionSheets` hosts
// the sheets once in the app layout. See CLAUDE.md → State Management.
//
// (Persisted UI *preferences* — display currency, branch filter — live in
// `uiPrefStore`, kept separate so nothing here ever accidentally persists.)

// The global "quick add" sheets the PageHeader 3-dot menu can launch on any
// screen. Each maps to a standalone form sheet hosted by QuickActionSheets.
export type QuickActionSheet =
  | 'customer'
  | 'sale'
  | 'customDebt'
  // Take money from any customer — the waterfall settles whatever they owe.
  | 'collect'
  | 'expense'
  | 'collectionsHistory'
  | 'batchRestock';

export interface UiState {
  // Which quick-action sheet is open (null = none).
  openSheet: QuickActionSheet | null;
  openQuickAction: (sheet: QuickActionSheet) => void;
  closeQuickAction: () => void;
}

export const useUiStore = create<UiState>()(
  immer((set) => ({
    openSheet: null,

    openQuickAction: (sheet) =>
      set((s) => {
        s.openSheet = sheet;
      }),

    closeQuickAction: () =>
      set((s) => {
        s.openSheet = null;
      }),
  })),
);
