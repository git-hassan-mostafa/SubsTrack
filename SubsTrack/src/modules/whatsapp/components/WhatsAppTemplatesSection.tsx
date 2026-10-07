import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { WhatsAppTemplate } from "@shared/core/types";
import { Button } from "@/src/shared/components/Button";
import { Chip } from "@/src/shared/components/Chip";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE } from "@/src/shared/constants";
import { useWhatsAppSlice } from "@shared/state/hooks/useWhatsAppSlice";
import { templateLabel } from "@shared/modules/whatsapp/utils/labels";
import {
  templateMetaText,
  templateStatusLabel,
  templateStatusTone,
  templateWarnings,
} from "@shared/modules/whatsapp/utils/whatsappView";

function TemplateRow({ template }: { template: WhatsAppTemplate }) {
  const { t } = useTranslation();
  return (
    <View className="py-3 border-b border-gray-100">
      <View className="flex-row items-center justify-between gap-2">
        <Text fontWeight="Medium" className="flex-1 text-sm text-gray-900">
          {templateLabel(template, t)}
        </Text>
        <Chip
          text={templateStatusLabel(template, t)}
          tone={templateStatusTone(template.status)}
        />
      </View>
      <Text className="text-xs text-gray-500 mt-1">
        {templateMetaText(template, t)}
      </Text>
      {templateWarnings(template, t).map((warning) => (
        <Text
          key={warning.text}
          className={`text-xs mt-1 ${warning.tone === "red" ? "text-red-600" : "text-amber-700"}`}
        >
          {warning.text}
        </Text>
      ))}
    </View>
  );
}

export function WhatsAppTemplatesSection() {
  const { t } = useTranslation();
  const templates = useWhatsAppSlice((s) => s.templates);
  const saving = useWhatsAppSlice((s) => s.saving);
  const submitTemplates = useWhatsAppSlice((s) => s.submitTemplates);
  const refresh = useWhatsAppSlice((s) => s.refresh);

  return (
    <View className={`${CARD_SURFACE} p-4 mb-4`}>
      <Text
        fontWeight="SemiBold"
        className="text-xs text-gray-400 uppercase tracking-wide mb-1"
      >
        {t("whatsapp.templates_title")}
      </Text>
      <Text className="text-xs text-gray-500 mb-2">
        {t("whatsapp.templates_hint")}
      </Text>
      {templates.length === 0 ? (
        <Text className="text-sm text-gray-600 py-2">
          {t("whatsapp.no_templates")}
        </Text>
      ) : (
        templates.map((template) => (
          <TemplateRow key={template.id} template={template} />
        ))
      )}
      <View className="gap-2 mt-3">
        <Button
          label={t("whatsapp.submit_templates")}
          variant="ghost"
          onPress={() => void submitTemplates()}
          loading={saving}
          fullWidth
        />
        <Button
          label={t("whatsapp.refresh_templates")}
          variant="ghost"
          onPress={() => void refresh()}
          disabled={saving}
          fullWidth
        />
      </View>
    </View>
  );
}
