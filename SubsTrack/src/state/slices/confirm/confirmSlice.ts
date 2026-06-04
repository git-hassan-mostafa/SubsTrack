import type { StateCreator } from 'zustand';
import type { GlobalState } from '@/src/state/globalStore';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  hideCancel?: boolean;
}

export interface ConfirmSlice {
  visible: boolean;
  options: ConfirmOptions | null;
  show: (options: ConfirmOptions) => Promise<boolean>;
  settle: (result: boolean) => void;
}

// Stored outside immer state — immer cannot proxy function references.
let pendingResolve: ((v: boolean) => void) | null = null;

export const createConfirmSlice: StateCreator<
  GlobalState,
  [['zustand/immer', never]],
  [],
  ConfirmSlice
> = (set) => ({
  visible: false,
  options: null,

  show: (options) =>
    new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
      set((s) => {
        s.confirm.visible = true;
        s.confirm.options = options;
      });
    }),

  settle: (result) => {
    set((s) => {
      s.confirm.visible = false;
      s.confirm.options = null;
    });
    pendingResolve?.(result);
    pendingResolve = null;
  },
});
