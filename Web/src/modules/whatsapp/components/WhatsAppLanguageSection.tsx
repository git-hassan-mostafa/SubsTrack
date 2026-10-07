import { useTranslation } from "react-i18next";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { WhatsAppLanguage } from "@shared/core/types";
import { whatsAppLanguageOptions } from "@shared/modules/whatsapp/utils/whatsappView";
import {
  useTenantSettingSlice,
  useWhatsAppLanguage,
} from "@shared/state/hooks/useTenantSettingSlice";
import { SettingsSection } from "@/modules/admin/tenant-settings/components/SettingsSection";

export function WhatsAppLanguageSection() {
  const { t } = useTranslation();
  const language = useWhatsAppLanguage();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setWhatsAppLanguage = useTenantSettingSlice((s) => s.setWhatsAppLanguage);

  return (
    <SettingsSection title={t("whatsapp.language_title")} hint={t("whatsapp.language_hint")}>
      <TextField
        select
        label={t("whatsapp.language_label")}
        value={language}
        disabled={saving}
        onChange={(event) => void setWhatsAppLanguage(event.target.value as WhatsAppLanguage)}
        sx={{ maxWidth: 320 }}
      >
        {whatsAppLanguageOptions(t).map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    </SettingsSection>
  );
}
