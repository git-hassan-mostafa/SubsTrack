import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import type { ActiveFilter } from "@shared/core/types";
import {
  DEBT_FILTER_LABEL_KEYS,
  DEFAULT_CUSTOMER_FILTERS,
  hasCustomerFilters,
  labelKeysOf,
  PAYMENT_FILTER_LABEL_KEYS,
  PHONE_FILTER_LABEL_KEYS,
  PORTAL_FILTER_LABEL_KEYS,
  STATUS_FILTER_LABEL_KEYS,
  TYPE_FILTER_LABEL_KEYS,
  UNPAID_MONTHS_OPTIONS,
  type CustomerFilters,
  type CustomerTypeFilter,
  type PaymentFilter,
  type UnpaidMonthsFilter,
  type YesNoFilter,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { COLORS } from "@/src/shared/constants";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { FilterChipsRow } from "@/src/shared/components/FilterChipsRow";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";

interface Props {
  value: CustomerFilters;
  onChange: (next: Partial<CustomerFilters>) => void;
  className?: string;
}

export function CustomerFilterChips({ value, onChange, className }: Props) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const getPlans = usePlanSlice((s) => s.getPlans);

  useEffect(() => {
    void getPlans();
  }, [getPlans]);

  const labelled = <K extends string>(labels: Record<K, string>) =>
    labelKeysOf(labels).map((key) => ({ value: key, label: t(labels[key]) }));

  return (
    <FilterChipsRow className={className}>
      <Dropdown<ActiveFilter>
        label={t("customers.filters.status")}
        options={labelled(STATUS_FILTER_LABEL_KEYS)}
        value={value.status}
        onChange={(status) => onChange({ status: status ?? "active" })}
        triggerStyle="chip"
      />
      <Dropdown<PaymentFilter>
        label={t("customers.filters.payment")}
        options={labelled(PAYMENT_FILTER_LABEL_KEYS)}
        value={value.payment}
        onChange={(payment) => onChange({ payment })}
        nullable
        nullLabel={t("customers.filters.payment_any")}
        triggerStyle="chip"
      />
      <Dropdown<YesNoFilter>
        label={t("customers.filters.debts")}
        options={labelled(DEBT_FILTER_LABEL_KEYS)}
        value={value.debt}
        onChange={(debt) => onChange({ debt })}
        nullable
        nullLabel={t("customers.filters.debts_any")}
        triggerStyle="chip"
      />
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
        triggerStyle="chip"
      />
      <Dropdown<string>
        label={t("customers.filters.plan")}
        options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        value={value.planId}
        onChange={(planId) => onChange({ planId })}
        nullable
        nullLabel={t("customers.filters.plan_any")}
        triggerStyle="chip"
      />
      <Dropdown<CustomerTypeFilter>
        label={t("customers.filters.type")}
        options={labelled(TYPE_FILTER_LABEL_KEYS)}
        value={value.type}
        onChange={(type) => onChange({ type })}
        nullable
        nullLabel={t("customers.filters.type_any")}
        triggerStyle="chip"
      />
      <DatePickerInput
        placeholder={t("customers.filters.paid_from")}
        value={value.paidFrom ?? ""}
        onChange={(day) => onChange({ paidFrom: day || null })}
        maxDate={value.paidTo ?? undefined}
        triggerStyle="chip"
        clearable
      />
      <DatePickerInput
        placeholder={t("customers.filters.paid_to")}
        value={value.paidTo ?? ""}
        onChange={(day) => onChange({ paidTo: day || null })}
        minDate={value.paidFrom ?? undefined}
        triggerStyle="chip"
        clearable
      />
      <Dropdown<YesNoFilter>
        label={t("customers.filters.phone")}
        options={labelled(PHONE_FILTER_LABEL_KEYS)}
        value={value.phone}
        onChange={(phone) => onChange({ phone })}
        nullable
        nullLabel={t("customers.filters.phone_any")}
        triggerStyle="chip"
      />
      <Dropdown<YesNoFilter>
        label={t("customers.filters.portal")}
        options={labelled(PORTAL_FILTER_LABEL_KEYS)}
        value={value.portal}
        onChange={(portal) => onChange({ portal })}
        nullable
        nullLabel={t("customers.filters.portal_any")}
        triggerStyle="chip"
      />
      {hasCustomerFilters(value) ? (
        <PressableOpacity
          onPress={() => onChange(DEFAULT_CUSTOMER_FILTERS)}
          className="flex-row items-center gap-x-1 rounded-full px-3 py-1.5"
        >
          <Ionicons name="close" size={14} color={COLORS.gray500} />
          <Text fontWeight="Medium" className="text-sm text-gray-500">
            {t("common.clear_filters")}
          </Text>
        </PressableOpacity>
      ) : null}
    </FilterChipsRow>
  );
}
