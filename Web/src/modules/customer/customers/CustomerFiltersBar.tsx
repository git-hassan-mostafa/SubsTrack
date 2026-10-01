import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import type { ActiveFilter } from "@shared/core/types";
import {
  DEBT_FILTER_LABEL_KEYS,
  hasCustomerFilters,
  labelKeysOf,
  PAYMENT_FILTER_LABEL_KEYS,
  PHONE_FILTER_LABEL_KEYS,
  PORTAL_FILTER_LABEL_KEYS,
  SORT_LABEL_KEYS,
  STATUS_FILTER_LABEL_KEYS,
  TYPE_FILTER_LABEL_KEYS,
  UNPAID_MONTHS_OPTIONS,
  type CustomerSort,
  type CustomerTypeFilter,
  type PaymentFilter,
  type UnpaidMonthsFilter,
  type YesNoFilter,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { DateField } from "@/shared/components/DateField";
import { FilterBar } from "@/shared/table/FilterBar";
import { FilterSelect } from "@/shared/table/FilterSelect";
import type { CustomerTableFilters } from "@/state/customersTable";

interface CustomerFiltersBarProps {
  value: CustomerTableFilters;
  onChange: (next: Partial<CustomerTableFilters>) => void;
  onClear: () => void;
}

export function CustomerFiltersBar({ value, onChange, onClear }: CustomerFiltersBarProps) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const getPlans = usePlanSlice((s) => s.getPlans);

  useEffect(() => {
    void getPlans();
  }, [getPlans]);

  const labelled = <K extends string>(labels: Record<K, string>) =>
    labelKeysOf(labels).map((key) => ({ value: key, label: t(labels[key]) }));

  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
      <FilterBar>
        <FilterSelect<ActiveFilter>
          label={t("customers.filters.status")}
          value={value.status}
          onChange={(status) => onChange({ status })}
          options={labelled(STATUS_FILTER_LABEL_KEYS)}
          minWidth={150}
        />
        <FilterSelect<PaymentFilter | null>
          label={t("customers.filters.payment")}
          anyLabel={t("customers.filters.payment_any")}
          value={value.payment}
          onChange={(payment) => onChange({ payment })}
          options={labelled(PAYMENT_FILTER_LABEL_KEYS)}
          minWidth={180}
        />
        <FilterSelect<YesNoFilter | null>
          label={t("customers.filters.debts")}
          anyLabel={t("customers.filters.debts_any")}
          value={value.debt}
          onChange={(debt) => onChange({ debt })}
          options={labelled(DEBT_FILTER_LABEL_KEYS)}
        />
        <FilterSelect<UnpaidMonthsFilter | null>
          label={t("customers.filters.unpaid_months")}
          anyLabel={t("customers.filters.unpaid_months_any")}
          value={value.unpaidMonths}
          onChange={(unpaidMonths) => onChange({ unpaidMonths })}
          options={UNPAID_MONTHS_OPTIONS.map((count) => ({
            value: count,
            label: t("customers.filters.unpaid_months_option", { count }),
          }))}
          minWidth={180}
        />
        <FilterSelect<string | null>
          label={t("customers.filters.plan")}
          anyLabel={t("customers.filters.plan_any")}
          value={value.planId}
          onChange={(planId) => onChange({ planId })}
          options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        />
        <FilterSelect<CustomerTypeFilter | null>
          label={t("customers.filters.type")}
          anyLabel={t("customers.filters.type_any")}
          value={value.type}
          onChange={(type) => onChange({ type })}
          options={labelled(TYPE_FILTER_LABEL_KEYS)}
          minWidth={180}
        />
        <Box sx={{ width: 170 }}>
          <DateField
            label={t("customers.filters.paid_from")}
            value={value.paidFrom ?? ""}
            onChange={(day) => onChange({ paidFrom: day || null })}
            maxDate={value.paidTo ?? undefined}
            size="small"
            clearable
          />
        </Box>
        <Box sx={{ width: 170 }}>
          <DateField
            label={t("customers.filters.paid_to")}
            value={value.paidTo ?? ""}
            onChange={(day) => onChange({ paidTo: day || null })}
            minDate={value.paidFrom ?? undefined}
            size="small"
            clearable
          />
        </Box>
        <FilterSelect<YesNoFilter | null>
          label={t("customers.filters.phone")}
          anyLabel={t("customers.filters.phone_any")}
          value={value.phone}
          onChange={(phone) => onChange({ phone })}
          options={labelled(PHONE_FILTER_LABEL_KEYS)}
          minWidth={180}
        />
        <FilterSelect<YesNoFilter | null>
          label={t("customers.filters.portal")}
          anyLabel={t("customers.filters.portal_any")}
          value={value.portal}
          onChange={(portal) => onChange({ portal })}
          options={labelled(PORTAL_FILTER_LABEL_KEYS)}
          minWidth={180}
        />
        <FilterSelect<CustomerSort>
          label={t("customers.filters.sort")}
          value={value.sort}
          onChange={(sort) => onChange({ sort })}
          options={labelled(SORT_LABEL_KEYS)}
          minWidth={200}
        />
        {hasCustomerFilters(value) ? (
          <Button onClick={onClear}>{t("common.clear_filters")}</Button>
        ) : null}
      </FilterBar>
    </Paper>
  );
}
