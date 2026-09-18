import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { confirm } from "@/src/shared/lib/confirm";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";

// Same reduction openWhatsApp does, so a field holding "-" or "n/a" reads as
// "cannot send" instead of producing a broken wa.me link.
function hasDialableDigits(phone: string | null | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length > 0;
}

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

  const canSend = useCallback(hasDialableDigits, []);

  return { canSend, openChat };
}
