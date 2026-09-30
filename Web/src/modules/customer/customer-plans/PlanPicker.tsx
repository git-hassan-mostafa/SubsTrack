import { useTranslation } from "react-i18next";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { findCurrency } from "@shared/core/utils/currency";
import { planPriceSublabel } from "@shared/modules/admin/plans/utils/planLabels";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";

const NO_PLAN = "";
const ADD_NEW = "__add_new_plan";

interface PlanPickerProps {
  value: string | null;
  onChange: (planId: string | null) => void;
  branchId: string | null;
  disabled?: boolean;
  onAddNew?: () => void;
}

// A table cell, so its column header is the label; only the branch's plans.
export function PlanPicker({
  value,
  onChange,
  branchId,
  disabled = false,
  onAddNew,
}: PlanPickerProps) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const options = plans.filter((plan) => plan.branchId === null || plan.branchId === branchId);

  return (
    <TextField
      select
      size="small"
      value={value ?? NO_PLAN}
      onChange={(event) => {
        if (event.target.value === ADD_NEW) onAddNew?.();
        else onChange(event.target.value === NO_PLAN ? null : event.target.value);
      }}
      disabled={disabled}
      fullWidth
      slotProps={{
        htmlInput: { "aria-label": t("customers.plan_label") },
        select: {
          displayEmpty: true,
          renderValue: (selected) =>
            options.find((plan) => plan.id === selected)?.name ?? t("common.no_plan"),
        },
      }}
    >
      <MenuItem value={NO_PLAN}>
        <ListItemText primary={t("common.no_plan")} secondary={t("customers.custom_plan_sublabel")} />
      </MenuItem>
      {options.map((plan) => (
        <MenuItem key={plan.id} value={plan.id}>
          <ListItemText
            primary={plan.name}
            secondary={planPriceSublabel(plan, currencies, display, t)}
          />
        </MenuItem>
      ))}
      {onAddNew ? <Divider /> : null}
      {onAddNew ? (
        <MenuItem value={ADD_NEW}>
          <ListItemText primary={t("web.customers.new_plan")} slotProps={{ primary: { color: "primary" } }} />
        </MenuItem>
      ) : null}
    </TextField>
  );
}
