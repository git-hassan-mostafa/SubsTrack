import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";

// A new tab, so the web app keeps its place; false when there is no number.
export function openWhatsApp(phone: string | null | undefined, message?: string): boolean {
  const url = whatsAppChatUrl(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
