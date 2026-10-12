import { create } from "zustand";
import type { ExceptionSource } from "@shared/core/runtime/runtime";
import { reportException } from "@shared/core/runtime/reportException";
import { describeError } from "./describeError";

export interface CrashReport {
  message: string;
  stack?: string;
  context?: string;
}

interface CrashState {
  crash: CrashReport | null;
  clearCrash: () => void;
}

let lastCrashError: unknown;

export const useCrashStore = create<CrashState>()((set) => ({
  crash: null,
  clearCrash: () => {
    lastCrashError = undefined;
    set({ crash: null });
  },
}));

// Logs every crash, but the first stays on the Try again page — it is the cause.
export function showCrash(
  error: unknown,
  source: ExceptionSource,
  context?: string,
): void {
  if (error === lastCrashError) return;
  lastCrashError = error;
  const report: CrashReport = { ...describeError(error), context };
  reportException({ source, ...report });
  useCrashStore.setState((state) => ({ crash: state.crash ?? report }));
}
