import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import type { Currency, Plan } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { linePeriodLabel } from "@shared/modules/admin/plans/utils/planLabels";
import { CurrencyInput } from "@/shared/components/CurrencyInput";

interface LinePriceFieldProps {
  plan: Plan | null;
  customPrice: number | null;
  customCurrencyId: string | null;
  onPriceChange: (amount: number | null, currencyId: string | null) => void;
  currencies: Currency[];
  disabled?: boolean;
}

// Collapsed to the plan price; the typed figure covers the plan's whole span.
export function LinePriceField({
  plan,
  customPrice,
  customCurrencyId,
  onPriceChange,
  currencies,
  disabled = false,
}: LinePriceFieldProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const planCurrency = plan ? findCurrency(currencies, plan.currencyId) : null;
  const planPrice = plan && !plan.isCustomPrice && plan.price !== null ? plan.price : null;
  const period = linePeriodLabel(plan?.durationMonths ?? 1, t);
  const clearLabel = planPrice !== null ? t("subscriptions.use_plan_price") : t("common.clear");

  if (customPrice === null && !opened) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body2" color="text.secondary">
          {planPrice !== null
            ? `${formatMoney(planPrice, planCurrency, planCurrency)} ${period}`
            : t("subscriptions.price_typed_each_month")}
        </Typography>
        <Button
          size="small"
          onClick={() => setOpened(true)}
          disabled={disabled}
          sx={{ flexShrink: 0 }}
        >
          {t("subscriptions.set_special_price")}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <CurrencyInput
        label={t("subscriptions.price_special_per", { period })}
        amount={customPrice}
        currencyId={customCurrencyId}
        onChange={({ amount, currencyId }) => onPriceChange(amount, currencyId)}
        currencies={currencies}
        placeholder={t("payments.enter_amount")}
        disabled={disabled}
        size="small"
      />
      <Tooltip title={clearLabel}>
        <span>
          <IconButton
            aria-label={clearLabel}
            onClick={() => {
              setOpened(false);
              onPriceChange(null, null);
            }}
            disabled={disabled}
          >
            <CloseIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
