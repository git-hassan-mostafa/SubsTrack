import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { confirm } from "@shared/shared/lib/confirm";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";

// The one place the app hands a customer over to WhatsApp, with or without text.
export function useWhatsApp() {
  const { t } = useTranslation();

  const openChat = useCallback(
    async (phone: string | null | undefined, text?: string) => {
      const ok = await openWhatsApp(phone, text);
      if (!ok) {
        await confirm({
          title: t("invoice.whatsapp_failed"),
          message: t(
            text
              ? "invoice.whatsapp_failed_message"
              : "invoice.whatsapp_open_failed_message",
          ),
          confirmLabel: t("common.ok"),
          hideCancel: true,
        });
      }
      return ok;
    },
    [t],
  );

  return { canSend: canSendWhatsApp, openChat };
}
