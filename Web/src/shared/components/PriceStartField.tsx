import { useTranslation } from "react-i18next";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { currentBillingMonth } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { priceStartOptions } from "@shared/modules/customer/customer-plans/utils/priceStartOptions";

interface PriceStartFieldProps {
  value: string | undefined;
  onChange: (month: string) => void;
  size?: "small" | "medium";
}

// Shown only once a saved price was changed — gotcha #185.
export function PriceStartField({ value, onChange, size }: PriceStartFieldProps) {
  const { t } = useTranslation();
  return (
    <TextField
      select
      size={size}
      label={t("subscriptions.price_from_label")}
      value={value ?? currentBillingMonth()}
      onChange={(event) => onChange(event.target.value)}
      helperText={t("subscriptions.price_from_hint")}
      fullWidth
    >
      {priceStartOptions().map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
