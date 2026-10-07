import { useTranslation } from "react-i18next";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { currencyPickOptions } from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import {
  useDisplayCurrencyId,
  useTenantSettingSlice,
} from "@shared/state/hooks/useTenantSettingSlice";
import { SettingsSection } from "./SettingsSection";

const USD_OPTION = "";

// Saved on pick, for the whole organization; stored amounts never change.
export function DisplayCurrencySection() {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setDisplayCurrencyId = useTenantSettingSlice((s) => s.setDisplayCurrencyId);
  const choices = currencyPickOptions(currencies.filter((c) => c.active));
  const value = choices.some((c) => c.value === displayCurrencyId) ? displayCurrencyId : null;

  return (
    <SettingsSection
      title={t("tenant_settings.display_section_title")}
      hint={t("tenant_settings.display_currency_hint")}
    >
      <TextField
        select
        label={t("tenant_settings.display_currency_label")}
        value={value ?? USD_OPTION}
        disabled={saving}
        onChange={(event) =>
          void setDisplayCurrencyId(event.target.value === USD_OPTION ? null : event.target.value)
        }
        slotProps={{
          select: {
            renderValue: (selected) =>
              choices.find((c) => c.value === selected)?.label ?? "USD",
          },
        }}
        sx={{ maxWidth: 360 }}
      >
        <MenuItem value={USD_OPTION}>
          <ListItemText primary="USD" secondary={t("tenant_settings.usd_base_note")} />
        </MenuItem>
        {choices.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            <ListItemText primary={option.label} secondary={option.sublabel} />
          </MenuItem>
        ))}
      </TextField>
    </SettingsSection>
  );
}
