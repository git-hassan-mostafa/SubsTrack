// Stored numbers may hold spaces, dashes or a '+'; wa.me wants digits only.
export function whatsAppChatUrl(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}
