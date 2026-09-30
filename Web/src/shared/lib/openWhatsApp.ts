import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";

// False when there is no number OR the browser blocked the tab (after an awaited save).
export function openWhatsApp(phone: string | null | undefined, message?: string): boolean {
  const url = whatsAppChatUrl(phone, message);
  if (!url) return false;
  const tab = window.open("", "_blank");
  if (!tab) return false;
  tab.opener = null;
  tab.location.href = url;
  return true;
}
