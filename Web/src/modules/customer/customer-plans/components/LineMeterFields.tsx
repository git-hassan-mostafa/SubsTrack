import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { AmountField } from "@/shared/components/AmountField";

interface LineMeterFieldsProps {
  meterNumber: string;
  startReading: number | null;
  startReadingLocked: boolean;
  disabled: boolean;
  onMeterNumberChange: (meterNumber: string) => void;
  onStartReadingChange: (startReading: number | null) => void;
}

export function LineMeterFields({
  meterNumber,
  startReading,
  startReadingLocked,
  disabled,
  onMeterNumberChange,
  onStartReadingChange,
}: LineMeterFieldsProps) {
  const { t } = useTranslation();

  const helperText = startReadingLocked
    ? t("subscriptions.start_reading_locked")
    : startReading === null && !disabled
      ? t("subscriptions.start_reading_hint")
      : undefined;

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
      <TextField
        label={t("subscriptions.meter_number_label")}
        value={meterNumber}
        onChange={(event) => onMeterNumberChange(event.target.value)}
        placeholder={t("subscriptions.meter_number_placeholder")}
        disabled={disabled}
        size="small"
        sx={{ flex: 1 }}
      />
      <AmountField
        label={t("subscriptions.start_reading_label")}
        value={startReading}
        onChange={onStartReadingChange}
        placeholder={t("subscriptions.start_reading_placeholder")}
        disabled={disabled || startReadingLocked}
        helperText={helperText}
        size="small"
        sx={{ flex: 1 }}
      />
    </Stack>
  );
}
