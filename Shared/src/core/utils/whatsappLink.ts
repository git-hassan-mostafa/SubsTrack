function dialableDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

// A field holding "-" or "n/a" cannot be sent to, rather than opening a broken link.
export function canSendWhatsApp(phone: string | null | undefined): boolean {
  return dialableDigits(phone).length > 0;
}

// Stored numbers may hold spaces, dashes or a '+'; wa.me wants digits only.
export function whatsAppChatUrl(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const digits = dialableDigits(phone);
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}
