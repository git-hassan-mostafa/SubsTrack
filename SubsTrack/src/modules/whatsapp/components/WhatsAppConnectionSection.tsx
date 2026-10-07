import { Linking, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { Chip } from "@/src/shared/components/Chip";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE } from "@/src/shared/constants";
import { useWhatsAppConnection } from "@shared/modules/whatsapp/hooks/useWhatsAppConnection";
import { CONNECT_FROM_PARAM, CONNECT_FROM_WEB } from "@shared/modules/whatsapp/utils/constants";

// On web the page replaces this tab, so it is told to come back in-app.
async function openConnectPage(url: string) {
  if (Platform.OS !== "web") {
    await Linking.openURL(url);
    return;
  }
  const target = new URL(url);
  target.searchParams.set(CONNECT_FROM_PARAM, CONNECT_FROM_WEB);
  window.location.assign(target.toString());
}

export function WhatsAppConnectionSection() {
  const { t } = useTranslation();
  const connection = useWhatsAppConnection(openConnectPage);
  const { account, saving, configured } = connection;

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <Text
        fontWeight="SemiBold"
        className="text-xs text-gray-400 uppercase tracking-wide mb-1"
      >
        {t("whatsapp.connection_title")}
      </Text>

      {account ? (
        <>
          <View className="flex-row items-center gap-2 mb-3 mt-1">
            <Chip
              text={connection.statusLabel ?? ""}
              tone={connection.statusTone ?? "gray"}
              size="md"
            />
            {account.isCoexistence ? (
              <Chip text={t("whatsapp.coexistence")} tone="sky" size="md" />
            ) : null}
          </View>
          {connection.attentionText ? (
            <View className="bg-amber-50 rounded-xl p-3 mb-3">
              <Text className="text-sm text-amber-800">{connection.attentionText}</Text>
            </View>
          ) : null}
          <InfoRows rows={connection.infoRows} />
          <Text className="text-xs text-gray-500 mt-3 mb-3">
            {t("whatsapp.billing_note")}
          </Text>
          <View className="gap-2">
            <Button
              label={t("whatsapp.check_again")}
              variant="ghost"
              onPress={() => void connection.refresh()}
              loading={saving}
              fullWidth
            />
            <Button
              label={t("whatsapp.reconnect")}
              variant="ghost"
              onPress={() => void connection.reconnect()}
              disabled={saving || !configured}
              fullWidth
            />
            <Button
              label={t("whatsapp.disconnect")}
              variant="danger"
              onPress={() => void connection.disconnect()}
              disabled={saving}
              fullWidth
            />
          </View>
        </>
      ) : (
        <>
          <Text className="text-sm text-gray-600 mb-3">
            {t("whatsapp.connect_intro")}
          </Text>
          {!configured ? (
            <Text className="text-sm text-amber-700 mb-3">
              {t("whatsapp.errors.not_configured")}
            </Text>
          ) : null}
          <PressableOpacity
            onPress={connection.toggleConsent}
            className="flex-row items-start gap-3 mb-4"
          >
            <Checkbox checked={connection.consent} onPress={connection.toggleConsent} />
            <Text className="flex-1 text-sm text-gray-700">
              {t("whatsapp.consent_label")}
            </Text>
          </PressableOpacity>
          <Button
            label={t("whatsapp.connect")}
            onPress={() => void connection.connect()}
            loading={saving}
            disabled={!connection.consent || !configured}
            fullWidth
          />
        </>
      )}
    </View>
  );
}
