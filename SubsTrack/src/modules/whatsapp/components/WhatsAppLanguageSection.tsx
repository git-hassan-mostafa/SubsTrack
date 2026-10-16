import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { WhatsAppLanguage } from "@shared/core/types";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { Text } from "@/src/shared/components/Text";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { CARD_SURFACE } from "@/src/shared/constants";
import { whatsAppLanguageOptions } from "@shared/modules/whatsapp/utils/whatsappView";
import {
  useTenantSettingSlice,
  useWhatsAppLanguage,
} from "@shared/state/hooks/useTenantSettingSlice";

export function WhatsAppLanguageSection() {
  const { t } = useTranslation();
  const language = useWhatsAppLanguage();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setWhatsAppLanguage = useTenantSettingSlice((s) => s.setWhatsAppLanguage);

  const options = whatsAppLanguageOptions(t);

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <SectionLabel className="mb-1">{t("whatsapp.language_title")}</SectionLabel>
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
