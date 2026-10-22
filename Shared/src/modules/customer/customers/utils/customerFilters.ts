import { matchesActiveFilter } from "@shared/core/utils/activeFilter";
import type {
  ActiveFilter,
  Customer,
  CustomerPlan,
  CustomerStatus,
  Plan,
} from "@shared/core/types";
import { dayStartIso, nextDayStartIso } from "@shared/core/utils/dateRange";
import {
  customerFlags,
  owesMoney,
  type CustomerFlag,
} from "@shared/modules/customer/customers/utils/customerFlags";

type FlagFilter = Exclude<CustomerFlag, "skipped" | "paid_until">;
export type PaymentFilter = FlagFilter | "expired_today";
export type YesNoFilter = "yes" | "no";
export type OwesFilter = "anything" | "debts" | "nothing";
export type CustomerTypeFilter = "regular" | "occasional";
export type UnpaidMonthsFilter = 1 | 2 | 3 | 6;

export interface CustomerFilters {
  status: ActiveFilter;
  payment: readonly PaymentFilter[];
  owes: OwesFilter | null;
  planId: readonly string[];
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
  | "to_collect"
  | "unpaid_months"
  | "longest_unpaid"
  | "newest";

export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = {
  status: "active",
  payment: [],
  owes: null,
  planId: [],
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
  written_off: "payments.written_off_badge",
  unpaid: "dashboard.unpaid",
  overdue: "customers.overdue",
  mixed: "customers.partly_paid",
  not_due_yet: "payments.not_due_yet_label",
  expiring: "customers.expiring_soon",
  expired_today: "customers.expired_today",
  expired: "customers.expired",
};

export const OWES_FILTER_LABEL_KEYS: Record<OwesFilter, string> = {
  anything: "customers.filters.owes_anything",
  debts: "customers.has_debts",
  nothing: "customers.filters.owes_nothing",
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

export const NO_PLAN_FILTER = "none";

export function planFilterOptions(
  plans: readonly Pick<Plan, "id" | "name">[],
  noPlanLabel: string,
): { value: string; label: string }[] {
  return [
    { value: NO_PLAN_FILTER, label: noPlanLabel },
    ...plans.map((plan) => ({ value: plan.id, label: plan.name })),
  ];
}

export const SORT_LABEL_KEYS: Record<CustomerSort, string> = {
  name: "customers.filters.sort_name",
  to_collect: "customers.filters.sort_to_collect",
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
  toCollectUsd: number | undefined;
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
    (key) => {
      const current = filters[key];
      const def = DEFAULT_CUSTOMER_FILTERS[key];
      if (Array.isArray(current)) return current.length > 0;
      return current !== def;
    },
  );
}

function matchesYesNo(choice: YesNoFilter | null, fact: boolean): boolean {
  return choice === null || (choice === "yes") === fact;
}

function matchesOwes(choice: OwesFilter | null, facts: CustomerListFacts): boolean {
  if (choice === null) return true;
  if (choice === "debts") return owesMoney(facts.debtUsd);
  return owesMoney(facts.toCollectUsd) === (choice === "anything");
}

// Unpaid takes Overdue cards, Paid takes prepaid ones: their pill holds it.
const PAYMENT_FILTER_FLAGS: Record<FlagFilter, readonly CustomerFlag[]> = {
  paid: ["paid", "paid_until", "expiring"],
  written_off: ["written_off"],
  unpaid: ["unpaid", "overdue"],
  overdue: ["overdue"],
  mixed: ["mixed"],
  not_due_yet: ["not_due_yet"],
  expiring: ["expiring"],
  expired: ["expired"],
};

// A payment pick shows only cards carrying one of its pills — gotcha #56.
function matchesPayment(
  customer: FilterableCustomer,
  status: CustomerStatus | null,
  payment: readonly PaymentFilter[],
): boolean {
  if (payment.length === 0) return true;
  if (!customer.active || !customer.isRegular) return false;
  const flags = customerFlags(status);
  return payment.some((p) =>
    p === "expired_today"
      ? isExpiredToday(status)
      : PAYMENT_FILTER_FLAGS[p].some((flag) => flags.includes(flag)),
  );
}

// The "Expired today" pill: the Expired one on its first day.
function isExpiredToday(status: CustomerStatus | null): boolean {
  return status?.prepaid?.state === "expired" && status.prepaid.days === 0;
}

// No plan = no active line on any plan; a line with only its own price counts as none.
function matchesPlan(
  customer: FilterableCustomer,
  planId: readonly string[],
): boolean {
  if (planId.length === 0) return true;
  const planIds = (customer.customerPlans ?? [])
    .filter((line) => line.active && line.planId !== null)
    .map((line) => line.planId);
  return planId.some((p) => (p === NO_PLAN_FILTER ? planIds.length === 0 : planIds.includes(p)));
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
    matchesActiveFilter(customer.active, filters.status) &&
    matchesPayment(customer, facts.status, filters.payment) &&
    matchesOwes(filters.owes, facts) &&
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

function isPaymentFilterValue(value: unknown): boolean {
  const allowed = labelKeysOf(PAYMENT_FILTER_LABEL_KEYS);
  return Array.isArray(value) && value.every((item) => isOneOf(allowed, item));
}

function isPlanFilterValue(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && (item === NO_PLAN_FILTER || ID_PATTERN.test(item)))
  );
}

export function isCustomerFilterQuery(value: unknown): value is CustomerFilterQuery {
  if (!value || typeof value !== "object") return false;
  const f = value as Record<string, unknown>;
  return (
    isOneOf(labelKeysOf(STATUS_FILTER_LABEL_KEYS), f.status) &&
    isPaymentFilterValue(f.payment) &&
    isNullOr(labelKeysOf(OWES_FILTER_LABEL_KEYS), f.owes) &&
    isPlanFilterValue(f.planId) &&
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
