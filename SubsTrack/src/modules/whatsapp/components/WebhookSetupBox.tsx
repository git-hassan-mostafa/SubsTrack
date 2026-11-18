import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { WhatsAppWebhookInfo } from "@shared/core/types";
import { FieldLabel } from "@/src/shared/components/FieldLabel";
import { Text } from "@/src/shared/components/Text";

interface Props {
  info: WhatsAppWebhookInfo;
}

export function WebhookSetupBox({ info }: Props) {
  const { t } = useTranslation();

  return (
    <View className="bg-amber-50 rounded-xl p-3 mb-3">
      <Text fontWeight="SemiBold" className="text-sm text-amber-900 mb-1">
        {t("whatsapp.own_app.webhook_title")}
      </Text>
      <Text className="text-sm text-amber-800 mb-3">{t("whatsapp.own_app.webhook_hint")}</Text>
      <FieldLabel>{t("whatsapp.own_app.webhook_url")}</FieldLabel>
      <Text selectable className="text-sm text-gray-900 mb-3">
        {info.url}
      </Text>
      <FieldLabel>{t("whatsapp.own_app.webhook_token")}</FieldLabel>
      <Text selectable className="text-sm text-gray-900">
        {info.verifyToken}
      </Text>
    </View>
  );
}
