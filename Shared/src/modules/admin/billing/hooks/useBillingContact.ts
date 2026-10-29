import { useTranslation } from "react-i18next";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { MAX_SELF_SERVE_PLANS } from "@shared/modules/admin/billing/utils/types";
import type { PricePackage } from "@shared/modules/admin/billing/utils/packages";
import { formatMoney } from "@shared/core/utils/currency";
import { confirm } from "@shared/shared/lib/confirm";
import { useSupportWhatsAppNumber } from "@shared/state/hooks/useOptionSlice";

export type OpenSupportChat = (phone: string, message: string) => unknown;

// Both apps' WhatsApp doors to support; each app passes its own opener.
export function useBillingContact(openChat: OpenSupportChat) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const supportNumber = useSupportWhatsAppNumber();
  const org = user?.tenant.name ?? "";

  const changePlan = () => {
    if (supportNumber) void openChat(supportNumber, t("billing.whatsapp_change_plan_message", { org }));
  };

  const askSpecialPrice = (plans: number) =>
    confirm({
      title: t("billing.special_price_title", { max: MAX_SELF_SERVE_PLANS }),
      message: supportNumber
        ? t("billing.special_price_body", { max: MAX_SELF_SERVE_PLANS })
        : t("billing.special_price_body_no_contact", { max: MAX_SELF_SERVE_PLANS }),
      confirmLabel: supportNumber ? t("billing.special_price_action") : t("common.ok"),
      hideCancel: !supportNumber,
      onConfirm: async () => {
        if (supportNumber) {
          await openChat(supportNumber, t("billing.whatsapp_special_price_message", { org, plans }));
        }
      },
    });

  const askPackage = ({ size, priceUsd }: PricePackage) => {
    if (!supportNumber) return;
    const message =
      priceUsd == null
        ? t("billing.whatsapp_package_ask_price_message", { org, customers: size })
        : t("billing.whatsapp_package_message", {
            org,
            customers: size,
            price: formatMoney(priceUsd, null, null),
          });
    void openChat(supportNumber, message);
  };

  return { canContact: !!supportNumber, changePlan, askSpecialPrice, askPackage };
}
