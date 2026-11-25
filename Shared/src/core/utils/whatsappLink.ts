import { internationalPhoneDigits } from "@edge/digits";

// A field holding "-" or "n/a" cannot be sent to, rather than opening a broken link.
export function canSendWhatsApp(phone: string | null | undefined): boolean {
  return internationalPhoneDigits(phone) !== null;
}

// wa.me wants the full international number as digits only.
export function whatsAppChatUrl(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const digits = internationalPhoneDigits(phone);
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}
