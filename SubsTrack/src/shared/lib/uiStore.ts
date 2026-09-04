import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';


// The global "quick add" sheets the PageHeader 3-dot menu can launch on any
// screen. Each maps to a standalone form sheet hosted by QuickActionSheets.
export type QuickActionSheet =
  | 'customer'
  | 'sale'
  | 'customDebt'
  | 'collect'
  | 'expense'
  | 'collectionsHistory'
  | 'batchRestock';

export interface UiState {
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
