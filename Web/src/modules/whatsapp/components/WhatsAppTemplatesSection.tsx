import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { WhatsAppTemplate } from "@shared/core/types";
import { templateLabel } from "@shared/modules/whatsapp/utils/labels";
import {
  templateMetaText,
  templateStatusLabel,
  templateStatusTone,
  templateWarnings,
} from "@shared/modules/whatsapp/utils/whatsappView";
import { useWhatsAppSlice } from "@shared/state/hooks/useWhatsAppSlice";
import { StatusChip } from "@/shared/components/StatusChip";
import { SettingsSection } from "@/modules/admin/tenant-settings/components/SettingsSection";

function TemplateRow({ template }: { template: WhatsAppTemplate }) {
  const { t } = useTranslation();
  return (
    <Stack component="li" spacing={0.5} sx={{ py: 1.5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {templateLabel(template, t)}
        </Typography>
        <StatusChip label={templateStatusLabel(template, t)} tone={templateStatusTone(template.status)} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {templateMetaText(template, t)}
      </Typography>
      {templateWarnings(template, t).map((warning) => (
        <Typography key={warning.text} variant="caption" color={warning.tone === "red" ? "error" : "warning.dark"}>
          {warning.text}
        </Typography>
      ))}
    </Stack>
  );
}

export function WhatsAppTemplatesSection() {
  const { t } = useTranslation();
  const templates = useWhatsAppSlice((s) => s.templates);
  const saving = useWhatsAppSlice((s) => s.saving);
  const submitTemplates = useWhatsAppSlice((s) => s.submitTemplates);
  const refresh = useWhatsAppSlice((s) => s.refresh);

  return (
    <SettingsSection title={t("whatsapp.templates_title")} hint={t("whatsapp.templates_hint")}>
      {templates.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("whatsapp.no_templates")}
        </Typography>
      ) : (
        <Stack
          component="ul"
          divider={<Divider component="li" aria-hidden />}
          sx={{ m: 0, p: 0, listStyle: "none" }}
        >
          {templates.map((template) => (
            <TemplateRow key={template.id} template={template} />
          ))}
        </Stack>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <Button variant="outlined" loading={saving} onClick={() => void submitTemplates()}>
          {t("whatsapp.submit_templates")}
        </Button>
        <Button variant="outlined" disabled={saving} onClick={() => void refresh()}>
          {t("whatsapp.refresh_templates")}
        </Button>
      </Stack>
    </SettingsSection>
  );
}
