import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { SxProps, Theme } from "@mui/material/styles";
import type { Currency } from "@shared/core/types";
import { currencyChoices, currencyPickOptions } from "@shared/core/utils/currency";

const USD_OPTION = "";

interface CurrencySelectProps {
  label: string;
  value: string | null;
  onChange: (currencyId: string | null) => void;
  currencies: Currency[];
  size?: "small" | "medium";
  sx?: SxProps<Theme>;
}

// A null currency is USD, the base, so it is always the first choice.
export function CurrencySelect({ label, value, onChange, currencies, size, sx }: CurrencySelectProps) {
  return (
    <TextField
      select
      size={size}
      label={label}
      value={value ?? USD_OPTION}
      onChange={(event) => onChange(event.target.value === USD_OPTION ? null : event.target.value)}
      sx={sx}
    >
      <MenuItem value={USD_OPTION}>USD</MenuItem>
      {currencyPickOptions(currencyChoices(currencies, value)).map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label} · {option.sublabel}
        </MenuItem>
      ))}
    </TextField>
  );
}
