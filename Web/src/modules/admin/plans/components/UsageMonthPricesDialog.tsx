import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Currency } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { useUsageMonthPrices } from "@shared/modules/admin/plans/hooks/useUsageMonthPrices";
import { usageMonthPriceLabel } from "@shared/modules/admin/plans/utils/planLabels";
import {
  usagePriceDraftState,
  type UsagePriceDraft,
  type UsagePriceEdit,
} from "@shared/modules/admin/plans/utils/usageMonthPrices";
import { priceStartOptionsWith } from "@shared/modules/customer/customer-plans/utils/priceStartOptions";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { FormDialog } from "@/shared/components/FormDialog";
import { markCustomersTableStale } from "@/state/customersTable";

interface UsageMonthPricesDialogProps {
  onClose: () => void;
}

export function UsageMonthPricesDialog({ onClose }: UsageMonthPricesDialogProps) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const fetchPlans = usePlanSlice((s) => s.fetchPlans);
  const clearPlanError = usePlanSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const prices = useUsageMonthPrices(plans, markCustomersTableStale);

  useEffect(() => {
    fetchPlans();
    return clearPlanError;
  }, [fetchPlans, clearPlanError]);

  const submit = async () => {
    if (await prices.save()) onClose();
  };

  return (
    <FormDialog
      open
      title={t("plans.month_prices_title")}
      subtitle={t("plans.month_prices_hint")}
      onClose={onClose}
      onSubmit={submit}
      dirty={prices.dirty}
      error={prices.error}
      onDismissError={prices.clearError}
      submitLabel={t("common.save")}
      submitDisabled={!prices.canSave}
      maxWidth="md"
    >
      <TextField
        select
        label={t("plans.month_prices_month")}
        value={prices.month}
        onChange={(event) => prices.setMonth(event.target.value)}
        fullWidth
      >
        {priceStartOptionsWith(prices.month).map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      {prices.loading ? (
        <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={24} aria-label={t("web.loading")} />
        </Box>
      ) : prices.drafts.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("plans.month_prices_no_plans")}
        </Typography>
      ) : (
        prices.drafts.map((draft) => (
          <UsagePriceRow
            key={`${draft.plan.id}-${prices.month}`}
            draft={draft}
            currencies={currencies}
            onChange={(patch) => prices.edit(draft.plan.id, patch)}
          />
        ))
      )}
    </FormDialog>
  );
}

interface UsagePriceRowProps {
  draft: UsagePriceDraft;
  currencies: Currency[];
  onChange: (patch: UsagePriceEdit) => void;
}

function UsagePriceRow({ draft, currencies, onChange }: UsagePriceRowProps) {
  const { t } = useTranslation();
  const { plan, saved, last } = draft;
  const usage = plan.usage;
  if (!usage) return null;
  const invalid = usagePriceDraftState(draft) === "invalid";
  const note = invalid
    ? t("plans.month_prices_invalid")
    : saved
      ? null
      : last
        ? `${t("plans.month_prices_none")} ${t("plans.month_prices_last", {
            month: billingMonthLabel(last.month, true),
            price: usageMonthPriceLabel(last.price, usage, currencies, t),
          })}`
        : t("plans.month_prices_none");

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
        {plan.name}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <CurrencyInput
          label={usage.feeName}
          amount={draft.fixedFee}
          currencyId={plan.currencyId}
          onChange={({ amount }) => onChange({ fixedFee: amount })}
          currencies={currencies}
          lockCurrency
        />
        <CurrencyInput
          label={t("plans.unit_price_label", { unit: usage.unitName })}
          amount={draft.unitPrice}
          currencyId={plan.currencyId}
          onChange={({ amount }) => onChange({ unitPrice: amount })}
          currencies={currencies}
          lockCurrency
        />
      </Stack>
      {note ? (
        <Typography
          variant="caption"
          color={invalid ? "error" : "text.secondary"}
          component="p"
          sx={{ mt: 1 }}
        >
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}
