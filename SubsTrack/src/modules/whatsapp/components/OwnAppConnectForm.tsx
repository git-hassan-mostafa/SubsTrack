import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { digitsOnly } from "@shared/core/utils/inputText";
import type { OwnAppConnect } from "@shared/modules/whatsapp/hooks/useOwnAppConnect";
import { Button } from "@/src/shared/components/Button";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { Input } from "@/src/shared/components/Input";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { Text } from "@/src/shared/components/Text";

const PIN_LENGTH = 6;

interface Props {
  ownApp: OwnAppConnect;
  onCancel: () => void;
}

export function OwnAppConnectForm({ ownApp, onCancel }: Props) {
  const { t } = useTranslation();

  return (
    <View className="mt-4 pt-4 border-t border-gray-200">
      <SectionLabel className="mb-1">{t("whatsapp.own_app.title")}</SectionLabel>
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
