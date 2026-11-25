import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { digitsOnly } from "@shared/core/utils/inputText";
import type { OwnAppConnect } from "@shared/modules/whatsapp/hooks/useOwnAppConnect";
import { OWN_APP_HELP_STEP_KEYS } from "@shared/modules/whatsapp/utils/ownAppForm";
import { Button } from "@/src/shared/components/Button";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { IconButton } from "@/src/shared/components/IconButton";
import { Input } from "@/src/shared/components/Input";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";

const PIN_LENGTH = 6;

interface Props {
  ownApp: OwnAppConnect;
  onCancel: () => void;
}

export function OwnAppConnectForm({ ownApp, onCancel }: Props) {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <View className="mt-4 pt-4 border-t border-gray-200">
      <View className="flex-row items-center justify-between">
        <SectionLabel className="mb-1">{t("whatsapp.own_app.title")}</SectionLabel>
        <IconButton
          icon="information-circle-outline"
          color={COLORS.primary}
          onPress={() => setHelpOpen(true)}
          accessibilityLabel={t("whatsapp.own_app.help_open")}
        />
      </View>
      <FormSheet
        visible={helpOpen}
        onDismiss={() => setHelpOpen(false)}
        title={t("whatsapp.own_app.help_title")}
      >
        <View className="gap-3">
          {OWN_APP_HELP_STEP_KEYS.map((key, index) => (
            <View key={key} className="flex-row items-start gap-3">
              <Text fontWeight="SemiBold" className="text-sm text-gray-900">
                {index + 1}.
              </Text>
              <Text className="flex-1 text-sm text-gray-600 leading-5">{t(key)}</Text>
            </View>
          ))}
        </View>
      </FormSheet>
      <Text className="text-sm text-gray-600 mb-3">{t("whatsapp.own_app.intro")}</Text>
      <Input
        label={t("whatsapp.own_app.token_label")}
        value={ownApp.token}
        onChangeText={ownApp.setToken}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Input
        label={t("whatsapp.own_app.secret_label")}
        value={ownApp.appSecret}
        onChangeText={ownApp.setAppSecret}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      {ownApp.step === "waba" ? (
        <>
          <Text className="text-sm text-gray-600 mb-2">{t("whatsapp.own_app.waba_hint")}</Text>
          <Input
            label={t("whatsapp.own_app.waba_label")}
            value={ownApp.wabaId}
            onChangeText={ownApp.setWabaId}
            sanitize={digitsOnly}
            keyboardType="number-pad"
          />
        </>
      ) : null}
      {ownApp.step === "choose_number" ? (
        <View className="mb-4">
          <Text className="text-sm text-gray-600 mb-2">{t("whatsapp.own_app.number_hint")}</Text>
          <Dropdown
            label={t("whatsapp.own_app.number_label")}
            options={ownApp.numberOptions}
            value={ownApp.phoneNumberId}
            onChange={ownApp.choosePhoneNumber}
            searchable
          />
        </View>
      ) : null}
      {ownApp.step === "pin" ? (
        <>
          <Text className="text-sm text-gray-600 mb-2">{t("whatsapp.own_app.pin_hint")}</Text>
          <Input
            label={t("whatsapp.own_app.pin_label")}
            value={ownApp.pin}
            onChangeText={ownApp.setPin}
            sanitize={(v) => digitsOnly(v).slice(0, PIN_LENGTH)}
            keyboardType="number-pad"
            secureTextEntry
          />
        </>
      ) : null}
      <View className="gap-2">
        <Button
          label={t("whatsapp.own_app.submit")}
          onPress={() => void ownApp.submit()}
          loading={ownApp.saving}
          disabled={!ownApp.canSubmit}
          fullWidth
        />
        <Button label={t("common.cancel")} variant="ghost" onPress={onCancel} fullWidth />
      </View>
    </View>
  );
}
