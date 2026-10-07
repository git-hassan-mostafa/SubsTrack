import { useTranslation } from "react-i18next";
import { planPriceSublabel } from "@shared/modules/admin/plans/utils/planLabels";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { SearchableSelect } from "@/shared/components/SearchableSelect";

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
  const display = useDisplayCurrency();
  const options = plans
    .filter((plan) => plan.branchId === null || plan.branchId === branchId)
    .map((plan) => ({
      value: plan.id,
      label: plan.name,
      sublabel: planPriceSublabel(plan, currencies, display, t),
    }));

  return (
    <SearchableSelect<string>
      size="small"
      ariaLabel={t("customers.plan_label")}
      value={value}
      onChange={onChange}
      options={options}
      nullOption={{ label: t("common.no_plan"), sublabel: t("customers.custom_plan_sublabel") }}
      addNew={onAddNew ? { label: t("web.customers.new_plan"), onPick: onAddNew } : undefined}
      disabled={disabled}
      fullWidth
    />
  );
}
