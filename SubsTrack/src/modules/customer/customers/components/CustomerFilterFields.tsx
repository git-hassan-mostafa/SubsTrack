import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ActiveFilter } from "@shared/core/types";
import {
  OWES_FILTER_LABEL_KEYS,
  labelKeysOf,
  PAYMENT_FILTER_LABEL_KEYS,
  PHONE_FILTER_LABEL_KEYS,
  planFilterOptions,
  PORTAL_FILTER_LABEL_KEYS,
  STATUS_FILTER_LABEL_KEYS,
  TYPE_FILTER_LABEL_KEYS,
  UNPAID_MONTHS_OPTIONS,
  type CustomerFilters,
  type CustomerTypeFilter,
  type PaymentFilter,
  type UnpaidMonthsFilter,
  type OwesFilter,
  type YesNoFilter,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { FilterRow } from "@/src/shared/components/FilterRow";

interface Props {
  value: CustomerFilters;
  onChange: (next: Partial<CustomerFilters>) => void;
}

export function CustomerFilterFields({ value, onChange }: Props) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const getPlans = usePlanSlice((s) => s.getPlans);

  useEffect(() => {
    void getPlans();
  }, [getPlans]);

  const labelled = <K extends string>(labels: Record<K, string>) =>
    labelKeysOf(labels).map((key) => ({ value: key, label: t(labels[key]) }));

  return (
    <>
      <FilterRow label={t("customers.filters.status")}>
        <Dropdown<ActiveFilter>
          label={t("customers.filters.status")}
          options={labelled(STATUS_FILTER_LABEL_KEYS)}
          value={value.status}
          onChange={(status) => onChange({ status: status ?? "active" })}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.payment")}>
        <Dropdown<PaymentFilter>
          label={t("customers.filters.payment")}
          options={labelled(PAYMENT_FILTER_LABEL_KEYS)}
          value={value.payment[0] ?? null}
          onChange={(payment) => onChange({ payment: payment ? [payment] : [] })}
          nullable
          nullLabel={t("customers.filters.payment_any")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.owes")}>
        <Dropdown<OwesFilter>
          label={t("customers.filters.owes")}
          options={labelled(OWES_FILTER_LABEL_KEYS)}
          value={value.owes}
          onChange={(owes) => onChange({ owes })}
          nullable
          nullLabel={t("customers.filters.owes_any")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.unpaid_months")}>
        <Dropdown<UnpaidMonthsFilter>
          label={t("customers.filters.unpaid_months")}
          options={UNPAID_MONTHS_OPTIONS.map((count) => ({
            value: count,
            label: t("customers.filters.unpaid_months_option", { count }),
          }))}
          value={value.unpaidMonths}
          onChange={(unpaidMonths) => onChange({ unpaidMonths })}
          nullable
          nullLabel={t("customers.filters.unpaid_months_any")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.plan")}>
        <Dropdown<string>
          label={t("customers.filters.plan")}
          options={planFilterOptions(plans, t("customers.filters.plan_none"))}
          value={value.planId[0] ?? null}
          onChange={(planId) => onChange({ planId: planId ? [planId] : [] })}
          nullable
          nullLabel={t("customers.filters.plan_any")}
          triggerStyle="filter"
          searchable
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.type")}>
        <Dropdown<CustomerTypeFilter>
          label={t("customers.filters.type")}
          options={labelled(TYPE_FILTER_LABEL_KEYS)}
          value={value.type}
          onChange={(type) => onChange({ type })}
          nullable
          nullLabel={t("customers.filters.type_any")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.last_paid")}>
        <DatePickerInput
          label={t("filters.from")}
          value={value.paidFrom ?? ""}
          onChange={(day) => onChange({ paidFrom: day || null })}
          maxDate={value.paidTo ?? undefined}
          triggerStyle="filter"
          clearable
        />
        <DatePickerInput
          label={t("filters.to")}
          value={value.paidTo ?? ""}
          onChange={(day) => onChange({ paidTo: day || null })}
          minDate={value.paidFrom ?? undefined}
          triggerStyle="filter"
          clearable
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.phone")}>
        <Dropdown<YesNoFilter>
          label={t("customers.filters.phone")}
          options={labelled(PHONE_FILTER_LABEL_KEYS)}
          value={value.phone}
          onChange={(phone) => onChange({ phone })}
          nullable
          nullLabel={t("customers.filters.phone_any")}
          triggerStyle="filter"
        />
      </FilterRow>
      <FilterRow label={t("customers.filters.portal")}>
        <Dropdown<YesNoFilter>
          label={t("customers.filters.portal")}
          options={labelled(PORTAL_FILTER_LABEL_KEYS)}
          value={value.portal}
          onChange={(portal) => onChange({ portal })}
          nullable
          nullLabel={t("customers.filters.portal_any")}
          triggerStyle="filter"
        />
      </FilterRow>
    </>
  );
}
