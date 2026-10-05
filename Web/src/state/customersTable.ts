import type { PageWindow } from "@shared/core/types";
import skippedMonthService from "@shared/modules/customer/customer-payments/services/SkippedMonthService";
import { getCustomerStatuses } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import customerService from "@shared/modules/customer/customers/services/CustomerService";
import {
  DEFAULT_CUSTOMER_FILTERS,
  DEFAULT_CUSTOMER_SORT,
  matchesCustomerFilters,
  toCustomerFilterQuery,
  type CustomerFilters,
  type CustomerSort,
} from "@shared/modules/customer/customers/utils/customerFilters";
import { MAX_STATUS_PAGE_SIZE } from "@shared/modules/customer/customers/utils/customerStatusPage";
import type {
  CustomerStatusList,
  CustomerStatusListRow,
} from "@shared/modules/customer/customers/utils/types";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import { ownedRowMatchesFilter } from "@shared/shared/lib/branchFilter";
import { getStore } from "@shared/state/globalStore";
import { getUnpaidRule } from "@shared/state/slices/payments/utils/unpaidRule";
import { createPagedStore, readEveryPage, type PagedQuery, type RowFit } from "./createPagedStore";

export type CustomerTableFilters = CustomerFilters & { sort: CustomerSort };

export type CustomerRow = CustomerStatusListRow & { id: string; branchId: string | null };

const DEFAULT_CUSTOMER_TABLE_FILTERS: CustomerTableFilters = {
  ...DEFAULT_CUSTOMER_FILTERS,
  sort: DEFAULT_CUSTOMER_SORT,
};

function toCustomerRow(row: CustomerStatusListRow): CustomerRow {
  return { ...row, id: row.customer.id, branchId: row.customer.branchId };
}

function toCustomerRows(list: CustomerStatusList) {
  return { rows: list.rows.map(toCustomerRow), total: list.total };
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

// The row carries no last-paid date, so a last-paid filter leaves it to the server.
const customerFits: RowFit<CustomerRow, CustomerTableFilters> = (row, query) => {
  const { sort: _sort, ...filters } = query.filters;
  if (filters.paidFrom || filters.paidTo) return null;
  const facts = { status: row.status, debtUsd: row.debtUsd, lastPaidAt: null };
  return (
    ownedRowMatchesFilter(row.branchId, query.branch) &&
    matchesCustomerFilters(row.customer, facts, toCustomerFilterQuery(filters))
  );
};

// Filters, sort and debt are worked out on the server over EVERY customer (D1).
export const useCustomersTable = createPagedStore<CustomerRow, CustomerTableFilters>(
  readCustomerPage,
  DEFAULT_CUSTOMER_TABLE_FILTERS,
  { fits: customerFits },
);

export function readAllCustomers(query: PagedQuery<CustomerTableFilters>): Promise<CustomerRow[]> {
  return readEveryPage(readCustomerPage, query, MAX_STATUS_PAGE_SIZE);
}

// One customer, read alone, through the same status rule the server page runs.
async function readCustomerRow(customerId: string, debtUsd: number): Promise<CustomerRow> {
  const customer = await customerService.getCustomer(customerId);
  const lines = customer.customerPlans ?? [];
  const [billsByLine, skips] = await Promise.all([
    chargeService.getMonthBillsForLines(lines.map((line) => line.id)),
    skippedMonthService.getSkipsForCustomer(customerId),
  ]);
  const statuses = getCustomerStatuses(
    [customer],
    [...billsByLine.values()].flat(),
    skips,
    getUnpaidRule(getStore().getState),
  );
  return toCustomerRow({ customer, status: statuses.get(customerId) ?? null, debtUsd });
}

// A customer write never moves its debt, so the row keeps the debt it had.
export async function patchCustomerRow(customerId: string, added = false): Promise<void> {
  const { loaded, rows } = useCustomersTable.getState();
  if (!loaded) return;
  const shown = rows.find((row) => row.id === customerId);
  if (!shown && !added) return;
  try {
    const row = await readCustomerRow(customerId, shown?.debtUsd ?? 0);
    const table = useCustomersTable.getState();
    if (shown) table.patchRow(row);
    else table.addRow(row);
  } catch {
    useCustomersTable.getState().markStale();
  }
}

export function markCustomersTableStale(): void {
  useCustomersTable.getState().markStale();
}
