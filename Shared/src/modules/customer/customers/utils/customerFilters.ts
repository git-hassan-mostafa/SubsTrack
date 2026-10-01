import type {
  ActiveFilter,
  Customer,
  CustomerPlan,
  CustomerStatus,
} from "@shared/core/types";
import { dayStartIso, nextDayStartIso } from "@shared/core/utils/dateRange";
import {
  customerFlags,
  hasDebtFlag,
  type CustomerFlag,
} from "@shared/modules/customer/customers/utils/customerFlags";

export type PaymentFilter = Exclude<CustomerFlag, "skipped">;
export type YesNoFilter = "yes" | "no";
export type CustomerTypeFilter = "regular" | "occasional";
export type UnpaidMonthsFilter = 1 | 2 | 3 | 6;

export interface CustomerFilters {
  status: ActiveFilter;
  payment: PaymentFilter | null;
  debt: YesNoFilter | null;
  planId: string | null;
  unpaidMonths: UnpaidMonthsFilter | null;
  type: CustomerTypeFilter | null;
  phone: YesNoFilter | null;
  portal: YesNoFilter | null;
  paidFrom: string | null;
  paidTo: string | null;
}

// The picked days as instants of the caller's own zone; the server runs in UTC.
export type CustomerFilterQuery = Omit<CustomerFilters, "paidFrom" | "paidTo"> & {
  paidSinceIso: string | null;
  paidBeforeIso: string | null;
};

export type CustomerSort =
  | "name"
  | "debt"
  | "unpaid_months"
  | "longest_unpaid"
  | "newest";

export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = {
  status: "active",
  payment: null,
  debt: null,
  planId: null,
  unpaidMonths: null,
  type: null,
  phone: null,
  portal: null,
  paidFrom: null,
  paidTo: null,
};

export const DEFAULT_CUSTOMER_SORT: CustomerSort = "name";

export const STATUS_FILTER_LABEL_KEYS: Record<ActiveFilter, string> = {
  active: "common.active",
  inactive: "common.inactive",
  all: "customers.filters.all_customers",
};

export const PAYMENT_FILTER_LABEL_KEYS: Record<PaymentFilter, string> = {
  paid: "common.paid",
  unpaid: "dashboard.unpaid",
  overdue: "customers.overdue",
  mixed: "customers.partly_paid",
  not_due_yet: "payments.not_due_yet_label",
};

export const DEBT_FILTER_LABEL_KEYS: Record<YesNoFilter, string> = {
  yes: "customers.has_debts",
  no: "customers.filters.no_debts",
};

export const TYPE_FILTER_LABEL_KEYS: Record<CustomerTypeFilter, string> = {
  regular: "customers.filters.type_regular",
  occasional: "customers.filters.type_occasional",
};

export const PHONE_FILTER_LABEL_KEYS: Record<YesNoFilter, string> = {
  yes: "customers.filters.phone_yes",
  no: "customers.filters.phone_no",
};

export const PORTAL_FILTER_LABEL_KEYS: Record<YesNoFilter, string> = {
  yes: "customers.filters.portal_yes",
  no: "customers.filters.portal_no",
};

export const UNPAID_MONTHS_OPTIONS: readonly UnpaidMonthsFilter[] = [1, 2, 3, 6];

export const SORT_LABEL_KEYS: Record<CustomerSort, string> = {
  name: "customers.filters.sort_name",
  debt: "customers.filters.sort_debt",
  unpaid_months: "customers.filters.sort_unpaid_months",
  longest_unpaid: "customers.filters.sort_longest_unpaid",
  newest: "customers.filters.sort_newest",
};

export function labelKeysOf<K extends string>(labels: Record<K, string>): K[] {
  return Object.keys(labels) as K[];
}

export type FilterableCustomer = Pick<
  Customer,
  "active" | "isRegular" | "phoneNumber" | "portalEnabled"
> & {
  customerPlans?: Pick<CustomerPlan, "planId" | "active">[];
};

// What the list knows about a customer beyond its own row.
export interface CustomerListFacts {
  status: CustomerStatus | null;
  debtUsd: number | undefined;
  lastPaidAt: string | null | undefined;
}

export function toCustomerFilterQuery(
  filters: CustomerFilters,
): CustomerFilterQuery {
  const { paidFrom, paidTo, ...rest } = filters;
  return {
    ...rest,
    paidSinceIso: paidFrom ? dayStartIso(paidFrom) : null,
    paidBeforeIso: paidTo ? nextDayStartIso(paidTo) : null,
  };
}

export function hasCustomerFilters(filters: CustomerFilters): boolean {
  return (Object.keys(DEFAULT_CUSTOMER_FILTERS) as (keyof CustomerFilters)[]).some(
    (key) => filters[key] !== DEFAULT_CUSTOMER_FILTERS[key],
  );
}

function matchesYesNo(choice: YesNoFilter | null, fact: boolean): boolean {
  return choice === null || (choice === "yes") === fact;
}

function matchesStatus(customer: FilterableCustomer, status: ActiveFilter): boolean {
  if (status === "all") return true;
  return customer.active === (status === "active");
}

// A payment pick shows only cards that carry that pill — gotcha #56.
function matchesPayment(
  customer: FilterableCustomer,
  status: CustomerStatus | null,
  payment: PaymentFilter | null,
): boolean {
  if (payment === null) return true;
  if (!customer.active || !customer.isRegular) return false;
  return customerFlags(status).includes(payment);
}

function matchesPlan(customer: FilterableCustomer, planId: string | null): boolean {
  if (planId === null) return true;
  return (customer.customerPlans ?? []).some(
    (line) => line.active && line.planId === planId,
  );
}

function matchesLastPaid(
  lastPaidAt: string | null | undefined,
  sinceIso: string | null,
  beforeIso: string | null,
): boolean {
  if (sinceIso === null && beforeIso === null) return true;
  if (!lastPaidAt) return false;
  const paid = Date.parse(lastPaidAt);
  if (sinceIso !== null && paid < Date.parse(sinceIso)) return false;
  return beforeIso === null || paid < Date.parse(beforeIso);
}

export function hasPhoneNumber(customer: Pick<Customer, "phoneNumber">): boolean {
  return !!customer.phoneNumber?.trim();
}

// The ONE customer-list filter rule; the phone and the customer-status server run it.
export function matchesCustomerFilters(
  customer: FilterableCustomer,
  facts: CustomerListFacts,
  filters: CustomerFilterQuery,
): boolean {
  return (
    matchesStatus(customer, filters.status) &&
    matchesPayment(customer, facts.status, filters.payment) &&
    matchesYesNo(filters.debt, hasDebtFlag(facts.debtUsd)) &&
    matchesPlan(customer, filters.planId) &&
    (filters.unpaidMonths === null ||
      (facts.status?.unpaidMonths ?? 0) >= filters.unpaidMonths) &&
    (filters.type === null || customer.isRegular === (filters.type === "regular")) &&
    matchesYesNo(filters.phone, hasPhoneNumber(customer)) &&
    matchesYesNo(filters.portal, customer.portalEnabled) &&
    matchesLastPaid(facts.lastPaidAt, filters.paidSinceIso, filters.paidBeforeIso)
  );
}

function isOneOf<T>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T);
}

function isNullOr<T>(values: readonly T[], value: unknown): boolean {
  return value === null || isOneOf(values, value);
}

function isInstantOrNull(value: unknown): boolean {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

const ID_PATTERN = /^[0-9a-f-]{36}$/i;

export function isCustomerFilterQuery(value: unknown): value is CustomerFilterQuery {
  if (!value || typeof value !== "object") return false;
  const f = value as Record<string, unknown>;
  return (
    isOneOf(labelKeysOf(STATUS_FILTER_LABEL_KEYS), f.status) &&
    isNullOr(labelKeysOf(PAYMENT_FILTER_LABEL_KEYS), f.payment) &&
    isNullOr(labelKeysOf(DEBT_FILTER_LABEL_KEYS), f.debt) &&
    (f.planId === null || (typeof f.planId === "string" && ID_PATTERN.test(f.planId))) &&
    isNullOr(UNPAID_MONTHS_OPTIONS, f.unpaidMonths) &&
    isNullOr(labelKeysOf(TYPE_FILTER_LABEL_KEYS), f.type) &&
    isNullOr(labelKeysOf(PHONE_FILTER_LABEL_KEYS), f.phone) &&
    isNullOr(labelKeysOf(PORTAL_FILTER_LABEL_KEYS), f.portal) &&
    isInstantOrNull(f.paidSinceIso) &&
    isInstantOrNull(f.paidBeforeIso)
  );
}

export function isCustomerSort(value: unknown): value is CustomerSort {
  return isOneOf(labelKeysOf(SORT_LABEL_KEYS), value);
}
