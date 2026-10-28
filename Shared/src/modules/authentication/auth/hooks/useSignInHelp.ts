import { useTranslation } from "react-i18next";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { useSupportWhatsAppNumber } from "@shared/state/hooks/useOptionSlice";

export interface SignInHelp {
  signInHelpUrl: string | null;
  newBusinessUrl: string | null;
}

// Both null until the SaaS owner sets SupportWhatsAppNumber.
export function useSignInHelp(): SignInHelp {
  const { t } = useTranslation();
  const supportNumber = useSupportWhatsAppNumber();
  return {
    signInHelpUrl: whatsAppChatUrl(supportNumber, t("auth.help_message")),
    newBusinessUrl: whatsAppChatUrl(
      supportNumber,
      t("auth.new_business_message"),
    ),
  };
}
