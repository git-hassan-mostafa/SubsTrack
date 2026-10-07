import type { SignupCompletion } from "@shared/modules/whatsapp/repository/IWhatsAppRepository";

export type SignupDetails = Omit<SignupCompletion, "s" | "code">;

export type SignupEvent =
  | { kind: "finished"; details: SignupDetails }
  | { kind: "no_number" }
  | { kind: "cancelled"; detail: string | null };

const SIGNUP_MESSAGE_TYPE = "WA_EMBEDDED_SIGNUP";
const NO_NUMBER_EVENT = "FINISH_ONLY_WABA";
const COEXISTENCE_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

// A bare endsWith("facebook.com") would also trust evilfacebook.com.
export function isFacebookOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function parsePayload(data: unknown): { event: string; data: Record<string, unknown> } | null {
  try {
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    if (payload?.type !== SIGNUP_MESSAGE_TYPE) return null;
    return { event: String(payload.event ?? ""), data: payload.data ?? {} };
  } catch {
    return null;
  }
}

// FINISH_ONLY_WABA has no phone number, so it never reaches the server.
export function readSignupEvent(origin: string, data: unknown): SignupEvent | null {
  if (!isFacebookOrigin(origin)) return null;
  const message = parsePayload(data);
  if (!message) return null;
  if (message.event === NO_NUMBER_EVENT) return { kind: "no_number" };
  if (message.event.startsWith("FINISH")) {
    return {
      kind: "finished",
      details: {
        wabaId: String(message.data.waba_id ?? ""),
        phoneNumberId: String(message.data.phone_number_id ?? ""),
        businessId: message.data.business_id ? String(message.data.business_id) : null,
        flow: message.event === COEXISTENCE_EVENT ? "coexistence" : "cloud",
      },
    };
  }
  if (message.event === "CANCEL" || message.event === "ERROR") {
    const detail = message.data.error_message;
    return { kind: "cancelled", detail: detail ? String(detail) : null };
  }
  return null;
}

export const SIGNUP_PIN_LENGTH = 6;

const SIGNUP_PIN = /^\d{6}$/;

export function isSignupPin(pin: string): boolean {
  return SIGNUP_PIN.test(pin);
}
