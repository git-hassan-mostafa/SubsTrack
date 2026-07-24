import type { ReactNode } from 'react';
import type { StateCreator } from 'zustand';
import type { GlobalState } from '@/src/state/globalStore';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  hideCancel?: boolean;
  // Optional extra content rendered between the message and the buttons — e.g. a
  // checkbox the caller reads (through its own closure) after the promise
  // settles. A render callback, not a stored element, so it lives outside immer.
  content?: () => ReactNode;
}

export interface ConfirmSlice {
  visible: boolean;
  options: ConfirmOptions | null;
  show: (options: ConfirmOptions) => Promise<boolean>;
  settle: (result: boolean) => void;
  // Reads the current dialog's extra content renderer (kept out of immer state).
  getContent: () => (() => ReactNode) | null;
}

// Stored outside immer state — immer cannot proxy function references. The
// content renderer rides alongside the resolver for the same reason.
let pendingResolve: ((v: boolean) => void) | null = null;
let pendingContent: (() => ReactNode) | null = null;

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
      pendingContent = options.content ?? null;
      set((s) => {
        s.confirm.visible = true;
        // The content callback can't be proxied by immer — strip it before it
        // enters state; it's read back through getContent().
        s.confirm.options = { ...options, content: undefined };
      });
    }),

  settle: (result) => {
    set((s) => {
      s.confirm.visible = false;
      s.confirm.options = null;
    });
    pendingResolve?.(result);
    pendingResolve = null;
    pendingContent = null;
  },

  getContent: () => pendingContent,
});
