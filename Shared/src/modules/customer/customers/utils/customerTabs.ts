import type { Customer, CustomerStatus } from "@shared/core/types";
import {
  customerFlags,
  hasDebtFlag,
  type CustomerFlag,
} from "@shared/modules/customer/customers/utils/customerFlags";

export type CustomerStatusTab = Exclude<CustomerFlag, "skipped">;

export type CustomerTab =
  | "all"
  | "active"
  | "inactive"
  | "has_debt"
  | CustomerStatusTab;

export const CUSTOMER_TABS: readonly CustomerTab[] = [
  "active",
  "unpaid",
  "overdue",
  "mixed",
  "paid",
  "not_due_yet",
  "has_debt",
  "all",
  "inactive",
];

export const CUSTOMER_TAB_LABEL_KEYS: Record<CustomerTab, string> = {
  active: "common.active",
  unpaid: "dashboard.unpaid",
  overdue: "customers.overdue",
  mixed: "customers.partly_paid",
  paid: "common.paid",
  not_due_yet: "payments.not_due_yet_label",
  has_debt: "customers.has_debts",
  all: "customers.all",
  inactive: "common.inactive",
};

export function isCustomerTab(value: unknown): value is CustomerTab {
  return CUSTOMER_TABS.includes(value as CustomerTab);
}

// A customer is in a tab only when its card shows that pill — gotcha #56.
export function matchesCustomerTab(
  customer: Pick<Customer, "active" | "isRegular">,
  status: CustomerStatus | null,
  debtUsd: number | undefined,
  tab: CustomerTab,
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "active":
      return customer.active;
    case "inactive":
      return !customer.active;
    case "has_debt":
      return hasDebtFlag(debtUsd);
    default:
      if (!customer.active || !customer.isRegular) return false;
      return customerFlags(status).includes(tab);
  }
}
