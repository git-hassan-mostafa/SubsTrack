import { useTranslation } from "react-i18next";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { ActiveFilter } from "@shared/core/types";

const OPTIONS: { value: ActiveFilter; labelKey: string }[] = [
  { value: "all", labelKey: "web.filter_all" },
  { value: "active", labelKey: "common.active" },
  { value: "inactive", labelKey: "common.inactive" },
];

interface ActiveFilterSelectProps {
  value: ActiveFilter;
  onChange: (value: ActiveFilter) => void;
}

export function ActiveFilterSelect({ value, onChange }: ActiveFilterSelectProps) {
  const { t } = useTranslation();
  return (
    <TextField
      select
      size="small"
      label={t("web.status")}
      value={value}
      onChange={(event) => onChange(event.target.value as ActiveFilter)}
      sx={{ minWidth: 160 }}
    >
      {OPTIONS.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {t(option.labelKey)}
        </MenuItem>
      ))}
    </TextField>
  );
}
