import type { OwnAppConnectResult, WhatsAppNumberChoice } from "@shared/core/types";
import type { OwnAppConnectInput } from "@shared/modules/whatsapp/repository/IWhatsAppRepository";
import { isSignupPin } from "@shared/modules/whatsapp/utils/embeddedSignup";

export const OWN_APP_HELP_STEP_KEYS: readonly string[] = [1, 2, 3, 4, 5, 6, 7].map(
  (n) => `whatsapp.own_app.help_step_${n}`,
);

const WABA_ID = /^\d+$/;

export type OwnAppStep = "keys" | "waba" | "choose_number" | "pin";

export interface OwnAppFields {
  token: string;
  appSecret: string;
  wabaId: string;
  phoneNumberId: string | null;
  pin: string;
}

export interface NumberOption {
  value: string;
  label: string;
  sublabel?: string;
}

// Every step re-sends the keys: the server keeps nothing between steps.
export function ownAppInput(
  fields: OwnAppFields,
  step: OwnAppStep,
  consent: boolean,
): OwnAppConnectInput | null {
  const token = fields.token.trim();
  const appSecret = fields.appSecret.trim();
  const wabaId = fields.wabaId.trim();
  if (!consent || !token || !appSecret) return null;
  if (step === "waba" && !WABA_ID.test(wabaId)) return null;
  if ((step === "choose_number" || step === "pin") && !fields.phoneNumberId) return null;
  if (step === "pin" && !isSignupPin(fields.pin)) return null;
  return {
    consent,
    token,
    appSecret,
    wabaId: step === "keys" || !wabaId ? null : wabaId,
    phoneNumberId: step === "keys" || step === "waba" ? null : fields.phoneNumberId,
    pin: step === "pin" ? fields.pin : null,
  };
}

export function nextOwnAppStep(result: OwnAppConnectResult): OwnAppStep | "done" {
  if (result.status === "needs_waba") return "waba";
  if (result.status === "choose_number") return "choose_number";
  if (result.status === "needs_pin") return "pin";
  return "done";
}

export function numberOptions(numbers: WhatsAppNumberChoice[]): NumberOption[] {
  return numbers.map((n) => ({
    value: n.phoneNumberId,
    label: n.displayPhoneNumber ?? n.phoneNumberId,
    sublabel: n.verifiedName ?? undefined,
  }));
}
