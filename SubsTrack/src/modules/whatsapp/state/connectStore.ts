import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { whatsAppService } from "@/src/modules/whatsapp/services/WhatsAppService";
import type {
  SignupCompletion,
  SignupResult,
} from "@/src/modules/whatsapp/repository/IWhatsAppRepository";
import { WhatsAppError } from "@/src/modules/whatsapp/utils/whatsappError";

export type ConnectPhase = "idle" | "working" | "needs_pin" | "done" | "error";

export interface ConnectState {
  phase: ConnectPhase;
  error: string | null;
  result: SignupResult | null;
  complete: (input: SignupCompletion) => Promise<void>;
  submitPin: (s: string, pin: string) => Promise<void>;
  fail: (message: string) => void;
  reset: () => void;
}

// Page-local flow of the public signup page; it holds no tenant data.
export const useConnectStore = create<ConnectState>()(
  immer((set) => {
    async function run(call: () => Promise<SignupResult>) {
      set((s) => {
        s.phase = "working";
        s.error = null;
      });
      try {
        const result = await call();
        set((s) => {
          s.phase = "done";
          s.result = result;
        });
      } catch (e) {
        const needsPin =
          e instanceof WhatsAppError && (e.code === "needs_pin" || e.code === "wrong_pin");
        set((s) => {
          s.phase = needsPin ? "needs_pin" : "error";
          s.error = (e as Error).message;
        });
      }
    }

    return {
      phase: "idle",
      error: null,
      result: null,

      complete: (input) => run(() => whatsAppService.completeSignup(input)),

      submitPin: (s, pin) => run(() => whatsAppService.registerPin(s, pin)),

      fail: (message) =>
        set((s) => {
          s.phase = "error";
          s.error = message;
        }),

      reset: () =>
        set((s) => {
          s.phase = "idle";
          s.error = null;
          s.result = null;
        }),
    };
  }),
);
