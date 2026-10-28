import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { openUrl } from "./openUrl";

// wa.me opens the installed app when present, otherwise the browser.
export async function openWhatsApp(
  phone: string | null | undefined,
  message?: string,
): Promise<boolean> {
  const url = whatsAppChatUrl(phone, message);
  return url ? openUrl(url) : false;
}
