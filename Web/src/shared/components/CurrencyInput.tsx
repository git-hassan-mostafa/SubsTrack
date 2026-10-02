import { useEffect, useId, useRef, useState } from "react";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import { useTranslation } from "react-i18next";
import type { Currency } from "@shared/core/types";
import { amountText, decimalDigitsOnly, parseAmount } from "@shared/core/utils/inputText";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";

const USD_OPTION = "";

export interface CurrencyAmount {
  amount: number | null;
  currencyId: string | null;
}

interface CurrencyInputProps {
  label: string;
  amount: number | null;
  currencyId: string | null;
  onChange: (next: CurrencyAmount) => void;
  currencies: Currency[];
  error?: string | null;
  helperText?: string;
  placeholder?: string;
  lockCurrency?: boolean;
  disabled?: boolean;
  required?: boolean;
  size?: "small" | "medium";
}

// Amount and currency stay AS TYPED, never converted; a null currency means USD.
export function CurrencyInput({
  label,
  amount,
  currencyId,
  onChange,
  currencies,
  error,
  helperText,
  placeholder,
  lockCurrency = false,
  disabled = false,
  required = false,
  size = "medium",
}: CurrencyInputProps) {
  const { t } = useTranslation();
  const lastUsedCurrencyId = useUiPrefStore((s) => s.lastUsedCurrencyId);
  const setLastUsedCurrencyId = useUiPrefStore((s) => s.setLastUsedCurrencyId);
  const [text, setText] = useState(amountText(amount));
  const defaultApplied = useRef(false);
  const currencyLabelId = useId();

  if (parseAmount(text) !== amount) setText(amountText(amount));

  useEffect(() => {
    if (defaultApplied.current) return;
    defaultApplied.current = true;
    if (currencyId !== null || amount !== null || !lastUsedCurrencyId) return;
    if (currencies.some((c) => c.id === lastUsedCurrencyId && c.active)) {
      onChange({ amount: null, currencyId: lastUsedCurrencyId });
    }
  }, [amount, currencyId, currencies, lastUsedCurrencyId, onChange]);

  const options = currencies.filter((c) => c.active || c.id === currencyId);

  const pickCurrency = (value: string) => {
    const nextId = value === USD_OPTION ? null : value;
    setLastUsedCurrencyId(nextId);
    onChange({ amount, currencyId: nextId });
  };

  return (
    <TextField
      label={label}
      value={text}
      required={required}
      size={size}
      disabled={disabled}
      error={Boolean(error)}
      helperText={error ?? helperText}
      placeholder={placeholder ?? "0.00"}
      onChange={(event) => {
        const next = decimalDigitsOnly(event.target.value);
        setText(next);
        onChange({ amount: parseAmount(next), currencyId });
      }}
      fullWidth
      slotProps={{
        htmlInput: { inputMode: "decimal" },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <span id={currencyLabelId} hidden>
                {t("tenant_settings.currencies_section_title")}
              </span>
              <Select
                variant="standard"
                disableUnderline
                value={currencyId ?? USD_OPTION}
                onChange={(event) => pickCurrency(event.target.value)}
                disabled={disabled || lockCurrency}
                renderValue={(value) =>
                  options.find((c) => c.id === value)?.code ?? "USD"
                }
                slotProps={{ input: { "aria-labelledby": currencyLabelId } }}
                sx={{ fontWeight: 600, minWidth: 64 }}
              >
                <MenuItem value={USD_OPTION}>USD</MenuItem>
                {options.map((currency) => (
                  <MenuItem key={currency.id} value={currency.id}>
                    {currency.code} · {currency.name}
                  </MenuItem>
                ))}
              </Select>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
