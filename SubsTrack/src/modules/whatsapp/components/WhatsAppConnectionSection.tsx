import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { Chip } from "@/src/shared/components/Chip";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE } from "@/src/shared/constants";
import { confirm } from "@/src/shared/lib/confirm";
import { useWhatsAppSignupOptions } from "@/src/state/hooks/useOptionSlice";
import { useWhatsAppSlice } from "@/src/state/hooks/useWhatsAppSlice";
import { tierLimit } from "@/supabase/functions/_shared/whatsapp/rules";

async function openConnectPage(url: string) {
  if (Platform.OS === "web") window.location.assign(url);
  else await Linking.openURL(url);
}

export function WhatsAppConnectionSection() {
  const { t } = useTranslation();
  const account = useWhatsAppSlice((s) => s.account);
  const saving = useWhatsAppSlice((s) => s.saving);
  const startConnect = useWhatsAppSlice((s) => s.startConnect);
  const refresh = useWhatsAppSlice((s) => s.refresh);
  const disconnect = useWhatsAppSlice((s) => s.disconnect);
  const options = useWhatsAppSignupOptions();
  const [consent, setConsent] = useState(false);

  const configured = !!(options.appId && options.configId && options.connectUrl);

  async function handleConnect(confirmed: boolean) {
    const url = await startConnect(confirmed);
    if (url) await openConnectPage(url);
  }

  async function handleReconnect() {
    const agreed = await confirm({
      title: t("whatsapp.reconnect"),
      message: t("whatsapp.reconnect_confirm"),
      confirmLabel: t("whatsapp.reconnect"),
    });
    if (agreed) await handleConnect(true);
  }

  async function handleDisconnect() {
    const agreed = await confirm({
      title: t("whatsapp.disconnect"),
      message: t("whatsapp.disconnect_confirm"),
      confirmLabel: t("whatsapp.disconnect"),
      destructive: true,
    });
    if (agreed) await disconnect();
  }

  const limit = tierLimit(account?.messagingLimitTier);

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
              text={t(`whatsapp.account_status.${account.status}`)}
              tone={account.status === "connected" ? "emerald" : "amber"}
              size="md"
            />
            {account.isCoexistence ? (
              <Chip text={t("whatsapp.coexistence")} tone="sky" size="md" />
            ) : null}
          </View>
          {account.status === "needs_attention" ? (
            <View className="bg-amber-50 rounded-xl p-3 mb-3">
              <Text className="text-sm text-amber-800">
                {t(`whatsapp.attention.${account.attentionCode}`, {
                  defaultValue: t("whatsapp.attention.default"),
                })}
              </Text>
            </View>
          ) : null}
          <InfoRows
            rows={[
              { label: t("whatsapp.number"), value: account.displayPhoneNumber },
              { label: t("whatsapp.display_name"), value: account.verifiedName },
              {
                label: t("whatsapp.quality"),
                value: account.qualityRating
                  ? t(`whatsapp.quality_rating.${account.qualityRating}`, {
                      defaultValue: account.qualityRating,
                    })
                  : null,
              },
              {
                label: t("whatsapp.daily_limit"),
                value: Number.isFinite(limit)
                  ? t("whatsapp.daily_limit_value", { count: limit })
                  : t("whatsapp.daily_limit_unlimited"),
              },
            ]}
          />
          <Text className="text-xs text-gray-500 mt-3 mb-3">
            {t("whatsapp.billing_note")}
          </Text>
          <View className="gap-2">
            <Button
              label={t("whatsapp.check_again")}
              variant="ghost"
              onPress={() => void refresh()}
              loading={saving}
              fullWidth
            />
            <Button
              label={t("whatsapp.reconnect")}
              variant="ghost"
              onPress={() => void handleReconnect()}
              disabled={saving || !configured}
              fullWidth
            />
            <Button
              label={t("whatsapp.disconnect")}
              variant="danger"
              onPress={() => void handleDisconnect()}
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
            onPress={() => setConsent((v) => !v)}
            className="flex-row items-start gap-3 mb-4"
          >
            <Checkbox checked={consent} onPress={() => setConsent((v) => !v)} />
            <Text className="flex-1 text-sm text-gray-700">
              {t("whatsapp.consent_label")}
            </Text>
          </PressableOpacity>
          <Button
            label={t("whatsapp.connect")}
            onPress={() => void handleConnect(consent)}
            loading={saving}
            disabled={!consent || !configured}
            fullWidth
          />
        </>
      )}
    </View>
  );
}
