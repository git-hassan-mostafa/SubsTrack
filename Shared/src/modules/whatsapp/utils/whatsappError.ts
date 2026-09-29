import i18n from "@shared/core/i18n";

// The server code picks the translation; its English text is the fallback.
export class WhatsAppError extends Error {
  readonly code: string;

  constructor(code: string, serverMessage: string) {
    const key = `whatsapp.errors.${code}`;
    super(i18n.exists(key) ? i18n.t(key) : serverMessage);
    this.name = "WhatsAppError";
    this.code = code;
  }
}
