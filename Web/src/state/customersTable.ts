import type { PageWindow } from "@shared/core/types";
import customerService from "@shared/modules/customer/customers/services/CustomerService";
import {
  CUSTOMER_TABS,
  type CustomerTab,
} from "@shared/modules/customer/customers/utils/customerTabs";
import { MAX_STATUS_PAGE_SIZE } from "@shared/modules/customer/customers/utils/customerStatusPage";
import type {
  CustomerStatusList,
  CustomerStatusListRow,
} from "@shared/modules/customer/customers/utils/types";
import { readAllPages } from "@shared/shared/hooks/loadAllPages";
import {
  createPagedStoreWithMeta,
  pageWindow,
  type PagedQuery,
  type PagedResult,
} from "./createPagedStore";

export interface CustomerFilters {
  tab: CustomerTab;
}

export type CustomerRow = CustomerStatusListRow & { id: string; branchId: string | null };

export type TabCounts = Record<CustomerTab, number> | null;

export const DEFAULT_CUSTOMER_TAB: CustomerTab = CUSTOMER_TABS[0];

function toCustomerRows(list: CustomerStatusList): PagedResult<CustomerRow, TabCounts> {
  return {
    rows: list.rows.map((row) => ({
      ...row,
      id: row.customer.id,
      branchId: row.customer.branchId,
    })),
    total: list.total,
    meta: list.counts,
  };
}

async function readCustomerPage(
  query: PagedQuery<CustomerFilters>,
  window: PageWindow,
): Promise<PagedResult<CustomerRow, TabCounts>> {
  const list = await customerService.getCustomerStatusPage({
    ...window,
    search: query.search,
    tab: query.filters.tab,
    branch: query.branch,
  });
  return toCustomerRows(list);
}

// Tabs, counts and debt are worked out on the server over EVERY customer (D1).
export const useCustomersTable = createPagedStoreWithMeta<CustomerRow, CustomerFilters, TabCounts>(
  (query) => readCustomerPage(query, pageWindow(query)),
  { tab: DEFAULT_CUSTOMER_TAB },
  null,
);

export function readAllCustomers(query: PagedQuery<CustomerFilters>): Promise<CustomerRow[]> {
  return readAllPages((window) => readCustomerPage(query, window), MAX_STATUS_PAGE_SIZE);
}

// A customer saved from outside the page (a quick action) re-reads an open table.
export function reloadCustomersTableIfLoaded(): void {
  const table = useCustomersTable.getState();
  if (table.loaded) void table.load();
}
