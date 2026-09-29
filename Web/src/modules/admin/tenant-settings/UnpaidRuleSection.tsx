import { useTranslation } from "react-i18next";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { UnpaidStartRule } from "@shared/core/types";
import {
  useTenantSettingSlice,
  useUnpaidStartRule,
} from "@shared/state/hooks/useTenantSettingSlice";
import { SettingsSection } from "./SettingsSection";

const RULES: { value: UnpaidStartRule; labelKey: string; hintKey: string }[] = [
  {
    value: "month_start",
    labelKey: "tenant_settings.unpaid_rule_month_start",
    hintKey: "tenant_settings.unpaid_rule_month_start_hint",
  },
  {
    value: "customer_start_day",
    labelKey: "tenant_settings.unpaid_rule_customer_start_day",
    hintKey: "tenant_settings.unpaid_rule_customer_start_day_hint",
  },
];

export function UnpaidRuleSection() {
  const { t } = useTranslation();
  const rule = useUnpaidStartRule();
  const saving = useTenantSettingSlice((s) => s.saving);
  const setUnpaidStartRule = useTenantSettingSlice((s) => s.setUnpaidStartRule);
  const picked = RULES.find((option) => option.value === rule) ?? RULES[0];

  return (
    <SettingsSection
      title={t("tenant_settings.unpaid_section_title")}
      hint={t("tenant_settings.unpaid_rule_hint")}
    >
      <TextField
        select
        label={t("tenant_settings.unpaid_rule_label")}
        value={rule}
        disabled={saving}
        onChange={(event) => void setUnpaidStartRule(event.target.value as UnpaidStartRule)}
        helperText={t(picked.hintKey)}
        slotProps={{
          select: {
            renderValue: (selected) =>
              t(RULES.find((option) => option.value === selected)?.labelKey ?? picked.labelKey),
          },
        }}
        sx={{ maxWidth: 480 }}
      >
        {RULES.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            <ListItemText
              primary={t(option.labelKey)}
              secondary={t(option.hintKey)}
              slotProps={{ secondary: { sx: { whiteSpace: "normal" } } }}
            />
          </MenuItem>
        ))}
      </TextField>
    </SettingsSection>
  );
}
