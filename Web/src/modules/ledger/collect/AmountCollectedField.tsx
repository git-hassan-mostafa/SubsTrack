import { useId } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Currency } from "@shared/core/types";
import {
  partialOutcome,
  type PaymentMode,
} from "@shared/modules/ledger/utils/amountCollected";
import { CurrencyInput } from "@/shared/components/CurrencyInput";

const MODES: PaymentMode[] = ["full", "partial", "debt"];

const MODE_LABEL_KEYS: Record<PaymentMode, string> = {
  full: "payments.full_payment",
  partial: "payments.partial_payment",
  debt: "payments.no_payment",
};

interface AmountCollectedFieldProps {
  mode: PaymentMode;
  onModeChange: (mode: PaymentMode) => void;
  amount: number | null;
  onAmountChange: (amount: number | null) => void;
  due: number;
  currencyId: string | null;
  currencies: Currency[];
  money: (amount: number) => string;
  caption?: string;
}

// The same Full / Partial / Pay later choice as the phone; the rule is Shared.
export function AmountCollectedField({
  mode,
  onModeChange,
  amount,
  onAmountChange,
  due,
  currencyId,
  currencies,
  money,
  caption,
}: AmountCollectedFieldProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const partialDisabled = !(due > 0);
  const outcome = mode === "partial" ? partialOutcome(due > 0 ? due : null, amount) : null;

  return (
    <FormControl component="fieldset">
      <FormLabel id={labelId} sx={{ fontWeight: 600, color: "text.primary" }}>
        {t("web.sales.amount_collected")}
      </FormLabel>
      {caption ? (
        <Typography variant="body2" color="text.secondary">
          {caption}
        </Typography>
      ) : null}
      <RadioGroup
        row
        aria-labelledby={labelId}
        value={mode}
        onChange={(event) => onModeChange(event.target.value as PaymentMode)}
      >
        {MODES.map((value) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio />}
            label={t(MODE_LABEL_KEYS[value])}
            disabled={value === "partial" && partialDisabled}
          />
        ))}
      </RadioGroup>
      {partialDisabled ? (
        <FormHelperText sx={{ mx: 0 }}>{t("payments.enter_amount_to_enable_partial")}</FormHelperText>
      ) : null}
      {mode === "partial" ? (
        <Stack spacing={1.5} sx={{ mt: 1.5, maxWidth: 360 }}>
          <CurrencyInput
            label={t("payments.amount_paid_label")}
            amount={amount}
            currencyId={currencyId}
            onChange={(next) => onAmountChange(next.amount)}
            currencies={currencies}
            placeholder={t("payments.enter_amount")}
            lockCurrency
            required
            error={outcome?.kind === "exceeds" ? t("errors.amount_paid_exceeds_due") : null}
            helperText={outcome?.kind === "cleared" ? t("payments.balance_cleared") : undefined}
          />
          {outcome?.kind === "owes" ? (
            <Alert severity="warning">
              {t("payments.partial_debt_notice", { amount: money(outcome.balance) })}
            </Alert>
          ) : null}
        </Stack>
      ) : null}
    </FormControl>
  );
}
