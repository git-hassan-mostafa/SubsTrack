import { useTranslation } from "react-i18next";
import { Dropdown, type DropdownOption } from "./Dropdown";
import type { Plan } from "@shared/core/types";
import { planPriceSublabel } from "@shared/modules/admin/plans/utils/planLabels";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";

interface PlanPickerProps {
  value: string | null;
  onChange: (planId: string | null) => void;
  branchId?: string | null;
  label?: string;
  placeholder?: string;
  nullable?: boolean;
  nullLabel?: string;
  nullSublabel?: string;
  onAddNew?: () => void;
  disabled?: boolean;
  disabledHint?: string;
}

// Only plans shared or owned by the branch; prices read in the display currency.
export function PlanPicker({
  value,
  onChange,
  branchId = null,
  label,
  placeholder,
  nullable = true,
  nullLabel,
  nullSublabel,
  onAddNew,
  disabled = false,
  disabledHint,
}: PlanPickerProps) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrency = useDisplayCurrency();

  const options: DropdownOption<string>[] = plans
    .filter((p: Plan) => p.branchId === null || p.branchId === branchId)
    .map((p: Plan) => ({
      value: p.id,
      label: p.name,
      sublabel: planPriceSublabel(p, currencies, displayCurrency, t),
    }));

  return (
    <Dropdown
      label={label ?? t("customers.plan_label")}
      placeholder={placeholder ?? t("customers.select_plan")}
      options={options}
      value={value}
      onChange={onChange}
      nullable={nullable}
      nullLabel={nullable ? (nullLabel ?? t("common.no_plan")) : undefined}
      nullSublabel={
        nullable
          ? (nullSublabel ?? t("customers.custom_plan_sublabel"))
          : undefined
      }
      onAddNew={onAddNew}
      disabled={disabled}
      disabledHint={disabledHint}
      searchable
    />
  );
}
