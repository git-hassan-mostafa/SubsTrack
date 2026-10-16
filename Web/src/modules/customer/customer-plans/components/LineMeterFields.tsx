import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { amountText, decimalDigitsOnly, parseAmount } from "@shared/core/utils/inputText";

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
  const [readingText, setReadingText] = useState(amountText(startReading));

  if (parseAmount(readingText) !== startReading) setReadingText(amountText(startReading));

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
      <TextField
        label={t("subscriptions.start_reading_label")}
        value={readingText}
        onChange={(event) => {
          const next = decimalDigitsOnly(event.target.value);
          setReadingText(next);
          onStartReadingChange(parseAmount(next));
        }}
        placeholder={t("subscriptions.start_reading_placeholder")}
        disabled={disabled || startReadingLocked}
        helperText={helperText}
        size="small"
        sx={{ flex: 1 }}
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
      />
    </Stack>
  );
}
