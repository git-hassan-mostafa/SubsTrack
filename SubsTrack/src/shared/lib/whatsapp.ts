import { Linking } from "react-native";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";

// wa.me opens the installed app when present, otherwise the browser.
export async function openWhatsApp(
  phone: string | null | undefined,
  message?: string,
): Promise<boolean> {
  const url = whatsAppChatUrl(phone, message);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
