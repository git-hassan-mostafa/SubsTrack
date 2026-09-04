import type { ReactNode } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// The app-wide confirm dialog. A standalone store, not a global slice: no slice
// reads it, and it has no owning module either — every module's forms reach it
// through `confirm()` in ./confirm.ts. See CLAUDE.md → State Management.

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

export interface ConfirmState {
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

export const useConfirmStore = create<ConfirmState>()(
  immer((set) => ({
    visible: false,
    options: null,

    show: (options) =>
      new Promise<boolean>((resolve) => {
        // Settle any dialog still outstanding as "cancelled" before replacing it.
        // Without this its promise never resolves, so an `await confirm(...)` in
        // the previous caller hangs forever — which leaves callers that gate on a
        // "already asking" flag (useUnsavedChangesGuard) permanently stuck.
        pendingResolve?.(false);
        pendingResolve = resolve;
        pendingContent = options.content ?? null;
        set((s) => {
          s.visible = true;
          // The content callback can't be proxied by immer — strip it before it
          // enters state; it's read back through getContent().
          s.options = { ...options, content: undefined };
        });
      }),

    settle: (result) => {
      set((s) => {
        s.visible = false;
        s.options = null;
      });
      pendingResolve?.(result);
      pendingResolve = null;
      pendingContent = null;
    },

    getContent: () => pendingContent,
  })),
);
