import i18n from "@shared/core/i18n";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { confirm } from "@shared/shared/lib/confirm";
import { openWhatsApp } from "./openWhatsApp";

// A blocked tab gets one more click: the confirm's button is a real user gesture.
export async function openWhatsAppAfterSave(
  phone: string | null | undefined,
  message: string,
): Promise<void> {
  if (!whatsAppChatUrl(phone) || openWhatsApp(phone, message)) return;
  await confirm({
    title: i18n.t("web.whatsapp.blocked_title"),
    message: i18n.t("web.whatsapp.blocked_message"),
    confirmLabel: i18n.t("web.whatsapp.open"),
    onConfirm: async () => {
      openWhatsApp(phone, message);
    },
  });
}
