import { useTranslation } from "react-i18next";
import { openWhatsApp } from "@/src/shared/lib/whatsapp";
import { SendOnWhatsAppButton } from "@/src/modules/invoicing";
import { useSupportWhatsAppNumber } from "@/src/state/hooks/useOptionSlice";

interface Props {
  // Tier the user wants — included in the pre-filled message. Omit for a
  // generic "upgrade my plan" request.
  tierName?: string;
  className?: string;
}

// Shown in place of the self-serve upgrade action when the SaaS owner has
// disabled in-app plan upgrades (AllowPlanUpgrade = false). Deep-links to the
// owner's WhatsApp with a pre-filled upgrade request.
export function ContactToUpgradeButton({ tierName, className }: Props) {
  const { t } = useTranslation();
  const number = useSupportWhatsAppNumber();

  if (!number) return null;

  function handlePress() {
    const message = tierName
      ? t("subscription.whatsapp_upgrade_message", { name: tierName })
      : t("subscription.whatsapp_upgrade_message_generic");
    openWhatsApp(number, message);
  }

  return (
    <SendOnWhatsAppButton
      phone={number}
      label={t("subscription.contact_to_upgrade")}
      onPress={handlePress}
      className={className}
    />
  );
}
