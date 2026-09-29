import { useTranslation } from "react-i18next";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { formatDate } from "@shared/core/utils/date";
import {
  PERIOD_PRESETS,
  periodFromPreset,
  type PeriodPreset,
  type ReportPeriod,
} from "@shared/core/utils/dateRange";
import { DateField } from "./DateField";

interface PeriodPickerProps {
  value: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
}

// The phone's presets; "custom" opens a From / To pair instead of the range line.
export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const { t } = useTranslation();

  const pick = (preset: PeriodPreset) => {
    if (preset === "custom") onChange({ ...value, preset: "custom" });
    else onChange(periodFromPreset(preset));
  };

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
      <TextField
        select
        size="small"
        label={t("web.period")}
        value={value.preset}
        onChange={(event) => pick(event.target.value as PeriodPreset)}
        sx={{ minWidth: 180 }}
      >
        {PERIOD_PRESETS.map((preset) => (
          <MenuItem key={preset} value={preset}>
            {t(`reports.period_${preset}`)}
          </MenuItem>
        ))}
      </TextField>
      {value.preset === "custom" ? (
        <>
          <DateField
            label={t("web.from_date")}
            value={value.fromDate}
            maxDate={value.toDate}
            onChange={(fromDate) => onChange({ ...value, fromDate })}
          />
          <DateField
            label={t("web.to_date")}
            value={value.toDate}
            minDate={value.fromDate}
            onChange={(toDate) => onChange({ ...value, toDate })}
          />
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {formatDate(value.fromDate)} — {formatDate(value.toDate)}
        </Typography>
      )}
    </Stack>
  );
}
