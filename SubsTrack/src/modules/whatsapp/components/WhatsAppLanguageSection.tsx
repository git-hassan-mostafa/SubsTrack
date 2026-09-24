import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { WhatsAppLanguage } from "@/src/core/types";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE } from "@/src/shared/constants";
import {
  useTenantSettingSlice,
  useWhatsAppLanguage,
} from "@/src/state/hooks/useTenantSettingSlice";

export function WhatsAppLanguageSection() {
  const { t } = useTranslation();
  const language = useWhatsAppLanguage();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setWhatsAppLanguage = useTenantSettingSlice((s) => s.setWhatsAppLanguage);

  const options: DropdownOption<WhatsAppLanguage>[] = [
    { label: t("whatsapp.language_en"), value: "en" },
    { label: t("whatsapp.language_ar"), value: "ar" },
  ];

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <Text
        fontWeight="SemiBold"
        className="text-xs text-gray-400 uppercase tracking-wide mb-1"
      >
        {t("whatsapp.language_title")}
      </Text>
      <Text className="text-xs text-gray-500 mb-3">
        {t("whatsapp.language_hint")}
      </Text>
      <Dropdown<WhatsAppLanguage>
        label={t("whatsapp.language_label")}
        options={options}
        value={language}
        onChange={(value) => {
          if (value) void setWhatsAppLanguage(value);
        }}
        disabled={saving}
      />
    </View>
  );
}
