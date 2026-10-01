import type { PageWindow } from "@shared/core/types";
import customerService from "@shared/modules/customer/customers/services/CustomerService";
import {
  DEFAULT_CUSTOMER_FILTERS,
  DEFAULT_CUSTOMER_SORT,
  toCustomerFilterQuery,
  type CustomerFilters,
  type CustomerSort,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { MAX_STATUS_PAGE_SIZE } from "@shared/modules/customer/customers/utils/customerStatusPage";
import type {
  CustomerStatusList,
  CustomerStatusListRow,
} from "@shared/modules/customer/customers/utils/types";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStore,
  pageWindow,
  type PagedQuery,
} from "./createPagedStore";

export type CustomerTableFilters = CustomerFilters & { sort: CustomerSort };

export type CustomerRow = CustomerStatusListRow & { id: string; branchId: string | null };

export const DEFAULT_CUSTOMER_TABLE_FILTERS: CustomerTableFilters = {
  ...DEFAULT_CUSTOMER_FILTERS,
  sort: DEFAULT_CUSTOMER_SORT,
};

function toCustomerRows(list: CustomerStatusList) {
  return {
    rows: list.rows.map((row) => ({
      ...row,
      id: row.customer.id,
      branchId: row.customer.branchId,
    })),
    total: list.total,
  };
}

async function readCustomerPage(
  query: PagedQuery<CustomerTableFilters>,
  window: PageWindow,
) {
  const { sort, ...filters } = query.filters;
  const list = await customerService.getCustomerStatusPage({
    ...window,
    search: query.search,
    filters: toCustomerFilterQuery(filters),
    sort,
    branch: query.branch,
  });
  return toCustomerRows(list);
}

// Filters, sort and debt are worked out on the server over EVERY customer (D1).
export const useCustomersTable = createPagedStore<CustomerRow, CustomerTableFilters>(
  (query) => readCustomerPage(query, pageWindow(query)),
  DEFAULT_CUSTOMER_TABLE_FILTERS,
  { rereadOnOpen: true },
);

export function readAllCustomers(query: PagedQuery<CustomerTableFilters>): Promise<CustomerRow[]> {
  return readAllPages((window) => readCustomerPage(query, window), MAX_STATUS_PAGE_SIZE);
}

// A customer saved from outside the page (a quick action) re-reads an open table.
export function reloadCustomersTableIfLoaded(): void {
  const table = useCustomersTable.getState();
  if (table.loaded) void table.load();
}
