import type { BranchFilter } from "@shared/core/constants";
import type {
  Customer,
  CustomerStatus,
  PageWindow,
} from "@shared/core/types";
import { DbCustomer } from "@shared/core/types/db";
import type {
  CustomerFilterQuery,
  CustomerSort,
} from "@shared/modules/customer/customers/utils/customerFilters";

// A customer row with its lines and their plans (CUSTOMER_WITH_LINES_SELECT).
export type DbCustomerWithLines = DbCustomer;

export interface CustomerStatusQuery extends PageWindow {
  search: string;
  filters: CustomerFilterQuery;
  sort: CustomerSort;
}

// `today` is the caller's own calendar day; the server clock is UTC.
export interface CustomerStatusRequest extends CustomerStatusQuery {
  branch: BranchFilter;
  today: string;
}

export interface CustomerStatusRow {
  customerId: string;
  status: CustomerStatus | null;
  debtUsd: number;
}

export interface CustomerStatusPage {
  rows: CustomerStatusRow[];
  total: number;
}

export interface CustomerStatusResponse {
  rows: {
    customer: DbCustomerWithLines;
    status: CustomerStatus | null;
    debtUsd: number;
  }[];
  total: number;
}

export interface CustomerStatusListRow {
  customer: Customer;
  status: CustomerStatus | null;
  debtUsd: number;
}

export interface CustomerStatusList {
  rows: CustomerStatusListRow[];
  total: number;
}
