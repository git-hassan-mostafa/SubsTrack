import { useTranslation } from "react-i18next";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import type { Currency, PlanUsage, UsageEntry } from "@shared/core/types";
import { amountText, digitsOnly, parseAmount } from "@shared/core/utils/inputText";
import { CurrencySelect } from "@/shared/components/CurrencySelect";

interface PlanUsageFieldsProps {
  usage: PlanUsage;
  currencyId: string | null;
  currencies: Currency[];
  onChange: (patch: Partial<PlanUsage>) => void;
  onCurrencyChange: (currencyId: string | null) => void;
}

const ENTRIES: UsageEntry[] = ["reading", "direct"];

export function PlanUsageFields({
  usage,
  currencyId,
  currencies,
  onChange,
  onCurrencyChange,
}: PlanUsageFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Stack spacing={1}>
        <FormLabel id="plan-usage-entry-label">{t("plans.usage_entry_label")}</FormLabel>
        <ToggleButtonGroup
          exclusive
          color="primary"
          value={usage.entry}
          onChange={(_event, entry: UsageEntry | null) => {
            if (entry) onChange({ entry });
          }}
          aria-labelledby="plan-usage-entry-label"
        >
          {ENTRIES.map((entry) => (
            <ToggleButton key={entry} value={entry} sx={{ px: 3 }}>
              {entry === "reading" ? t("plans.usage_entry_reading") : t("plans.usage_entry_direct")}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <FormHelperText>
          {usage.entry === "reading"
            ? t("plans.usage_entry_reading_hint")
            : t("plans.usage_entry_direct_hint")}
        </FormHelperText>
      </Stack>
      <TextField
        label={t("plans.unit_name_label")}
        value={usage.unitName}
        onChange={(event) => onChange({ unitName: event.target.value })}
        placeholder={t("plans.unit_name_placeholder")}
        required
        fullWidth
      />
      <TextField
        label={t("plans.fee_name_label")}
        value={usage.feeName}
        onChange={(event) => onChange({ feeName: event.target.value })}
        placeholder={t("plans.fee_name_placeholder")}
        required
        fullWidth
      />
      <CurrencySelect
        label={t("plans.usage_currency_label")}
        value={currencyId}
        onChange={onCurrencyChange}
        currencies={currencies}
      />
      <TextField
        label={t("plans.high_usage_label")}
        value={amountText(usage.highUsagePercent)}
        onChange={(event) =>
          onChange({ highUsagePercent: parseAmount(digitsOnly(event.target.value)) })
        }
        placeholder={t("plans.high_usage_placeholder")}
        helperText={t("plans.high_usage_hint")}
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
        fullWidth
      />
    </>
  );
}
