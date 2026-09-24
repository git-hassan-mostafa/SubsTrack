import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { WhatsAppTemplate } from "@/src/core/types";
import { Button } from "@/src/shared/components/Button";
import { Chip, type ChipTone } from "@/src/shared/components/Chip";
import { Text } from "@/src/shared/components/Text";
import { CARD_SURFACE } from "@/src/shared/constants";
import { useWhatsAppSlice } from "@/src/state/hooks/useWhatsAppSlice";
import { templateLabel } from "../utils/labels";

const STATUS_TONES: Record<string, ChipTone> = {
  APPROVED: "emerald",
  PENDING: "amber",
  IN_APPEAL: "amber",
  REJECTED: "red",
  DISABLED: "red",
  PAUSED: "orange",
  FLAGGED: "orange",
};

function TemplateRow({ template }: { template: WhatsAppTemplate }) {
  const { t } = useTranslation();
  return (
    <View className="py-3 border-b border-gray-100">
      <View className="flex-row items-center justify-between gap-2">
        <Text fontWeight="Medium" className="flex-1 text-sm text-gray-900">
          {templateLabel(template, t)}
        </Text>
        <Chip
          text={t(`whatsapp.template_status.${template.status}`, {
            defaultValue: template.status,
          })}
          tone={STATUS_TONES[template.status] ?? "gray"}
        />
      </View>
      <Text className="text-xs text-gray-500 mt-1">
        {[
          template.language.toUpperCase(),
          template.category,
          template.supported ? null : t("whatsapp.template_not_supported"),
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {template.rejectionReason ? (
        <Text className="text-xs text-red-600 mt-1">
          {t("whatsapp.rejection_reason", { reason: template.rejectionReason })}
        </Text>
      ) : null}
      {template.isSijil && template.category === "MARKETING" ? (
        <Text className="text-xs text-amber-700 mt-1">
          {t("whatsapp.marketing_warning")}
        </Text>
      ) : null}
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
