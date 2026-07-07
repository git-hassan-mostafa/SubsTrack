import { useTranslation } from "react-i18next";
import { Dropdown, type DropdownOption } from "./Dropdown";
import type { Plan } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";

interface PlanPickerProps {
  value: string | null;
  onChange: (planId: string | null) => void;
  /**
   * Restrict the list to plans matching this branch. Shared plans
   * (branchId === null) are always included. Pass null to show every plan
   * across the tenant.
   */
  branchId?: string | null;
  /** Defaults to t('customers.plan_label'). */
  label?: string;
  /** Defaults to t('customers.select_plan'). */
  placeholder?: string;
  /** Defaults to true. When true, exposes a "no plan" option. */
  nullable?: boolean;
  /** Defaults to t('common.no_plan'). Only used when nullable. */
  nullLabel?: string;
  /** Defaults to t('customers.custom_plan_sublabel'). Only used when nullable. */
  nullSublabel?: string;
  /** Renders a "+" beside the label that opens a form to add a new plan. */
  onAddNew?: () => void;
}

/**
 * Form-field plan picker. Reads plans from the global slice, filters by branch,
 * and formats each plan's price into the user's display currency (with the
 * plan's stored currency as the source). Encapsulates the price-conversion
 * boilerplate that previously lived in each FormSheet.
 */
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
}: PlanPickerProps) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const displayCurrency = findCurrency(currencies, displayCurrencyId);

  const options: DropdownOption<string>[] = plans
    .filter((p: Plan) => p.branchId === null || p.branchId === branchId)
    .map((p: Plan) => {
      const source = findCurrency(currencies, p.currencyId);
      const priceLabel = formatMoney(p.price ?? 0, source, displayCurrency);
      const periodLabel =
        p.durationMonths === 1
          ? t("plans.per_month")
          : t("plans.n_months", { count: p.durationMonths });
      return {
        value: p.id,
        label: p.name,
        sublabel: p.isCustomPrice
          ? t("common.custom_pricing")
          : `${priceLabel} / ${periodLabel}`,
      };
    });

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
    />
  );
}
