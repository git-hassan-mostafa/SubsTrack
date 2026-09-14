import type { ReactNode } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';


export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  hideCancel?: boolean;
  content?: () => ReactNode;
  onConfirm?: () => Promise<void>;
}

export interface ConfirmState {
  visible: boolean;
  options: ConfirmOptions | null;
  show: (options: ConfirmOptions) => Promise<boolean>;
  settle: (result: boolean) => void;
  getContent: () => (() => ReactNode) | null;
  getOnConfirm: () => (() => Promise<void>) | null;
}

let pendingResolve: ((v: boolean) => void) | null = null;
let pendingContent: (() => ReactNode) | null = null;
let pendingOnConfirm: (() => Promise<void>) | null = null;

export const useConfirmStore = create<ConfirmState>()(
  immer((set) => ({
    visible: false,
    options: null,

    show: (options) =>
      new Promise<boolean>((resolve) => {
        pendingResolve?.(false);
        pendingResolve = resolve;
        pendingContent = options.content ?? null;
        pendingOnConfirm = options.onConfirm ?? null;
        set((s) => {
          s.visible = true;
          s.options = { ...options, content: undefined, onConfirm: undefined };
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
      pendingOnConfirm = null;
    },

    getContent: () => pendingContent,

    getOnConfirm: () => pendingOnConfirm,
  })),
);
