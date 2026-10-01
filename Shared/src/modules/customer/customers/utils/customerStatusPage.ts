import {
  BRANCH_FILTER_UNASSIGNED,
  type BranchFilter,
} from "@shared/core/constants";
import { isValidDateString, onCalendarDay } from "@shared/core/utils/date";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import type { DbTenantSetting } from "@shared/core/types/db";
import { TENANT_SETTING_KEYS } from "@shared/modules/admin/tenant-settings/utils/constants";
import { parseUnpaidStartRule } from "@shared/modules/admin/tenant-settings/utils/unpaidStartRule";
import { getCustomerStatuses } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import {
  readCustomerStatusFacts,
  type CustomerStatusFacts,
  type CustomerStatusFactsWire,
  type StatusListCustomer,
} from "@shared/modules/customer/customers/utils/customerStatusFacts";
import {
  isCustomerFilterQuery,
  isCustomerSort,
  matchesCustomerFilters,
  type CustomerSort,
} from "@shared/modules/customer/customers/utils/customerFilters";
import type {
  CustomerStatusPage,
  CustomerStatusQuery,
  CustomerStatusRequest,
  CustomerStatusRow,
} from "@shared/modules/customer/customers/utils/types";

export const MAX_STATUS_PAGE_SIZE = 100;

const MAX_SEARCH_LENGTH = 200;
const DAY_MS = 86_400_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The server twin of the phone's `ilike` search on the same four columns.
export function matchesCustomerSearch(
  customer: StatusListCustomer,
  term: string,
): boolean {
  if (!term) return true;
  return [
    customer.name,
    customer.phoneNumber,
    customer.address,
    customer.area,
  ].some((field) => field?.toLowerCase().includes(term));
}

interface SortableRow {
  customer: StatusListCustomer;
  row: CustomerStatusRow;
}

function byName(a: SortableRow, b: SortableRow): number {
  const x = a.customer;
  const y = b.customer;
  return x.name.localeCompare(y.name) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}

function paidTime(customer: StatusListCustomer): number {
  return customer.lastPaidAt ? Date.parse(customer.lastPaidAt) : -Infinity;
}

const SORTS: Record<CustomerSort, (a: SortableRow, b: SortableRow) => number> = {
  name: () => 0,
  debt: (a, b) => b.row.debtUsd - a.row.debtUsd,
  unpaid_months: (a, b) =>
    (b.row.status?.unpaidMonths ?? 0) - (a.row.status?.unpaidMonths ?? 0),
  longest_unpaid: (a, b) => paidTime(a.customer) - paidTime(b.customer),
  newest: (a, b) => b.customer.createdAt.localeCompare(a.customer.createdAt),
};

// Never-paid customers sort as the longest unpaid; every tie falls back to name.
export function pageCustomerStatuses(
  facts: CustomerStatusFacts,
  query: CustomerStatusQuery,
): CustomerStatusPage {
  const statuses = getCustomerStatuses(
    facts.customers,
    facts.bills,
    facts.skips,
    facts.unpaidRule,
  );
  const term = sanitizeSearchTerm(query.search).toLowerCase();
  const matched: SortableRow[] = [];
  for (const customer of facts.customers) {
    if (!matchesCustomerSearch(customer, term)) continue;
    const row: CustomerStatusRow = {
      customerId: customer.id,
      status: statuses.get(customer.id) ?? null,
      debtUsd: facts.debtUsd.get(customer.id) ?? 0,
    };
    const listFacts = { ...row, lastPaidAt: customer.lastPaidAt };
    if (matchesCustomerFilters(customer, listFacts, query.filters)) {
      matched.push({ customer, row });
    }
  }
  const order = SORTS[query.sort];
  matched.sort((a, b) => order(a, b) || byName(a, b));

  return {
    rows: matched
      .slice(query.offset, query.offset + query.limit)
      .map(({ row }) => row),
    total: matched.length,
  };
}

// The whole server step: decode, then run the month rules on the caller's day.
export function customerStatusPage(
  wire: CustomerStatusFactsWire,
  settings: Pick<DbTenantSetting, "key" | "value">[],
  request: CustomerStatusRequest,
): CustomerStatusPage {
  const storedRule = settings.find(
    (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
  )?.value;
  const facts = readCustomerStatusFacts(wire, parseUnpaidStartRule(storedRule));
  return onCalendarDay(request.today, () =>
    pageCustomerStatuses(facts, request),
  );
}

// The branch filter as `customer_status_facts()` arguments.
export function factsRpcArgs(branch: BranchFilter): {
  p_branch_id: string | null;
  p_unassigned: boolean;
} {
  return {
    p_branch_id: branch && branch !== BRANCH_FILTER_UNASSIGNED ? branch : null,
    p_unassigned: branch === BRANCH_FILTER_UNASSIGNED,
  };
}

function isWholeNumber(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= min &&
    (value as number) <= max
  );
}

function isBranchFilter(value: unknown): value is BranchFilter {
  return (
    value === null ||
    value === BRANCH_FILTER_UNASSIGNED ||
    (typeof value === "string" && UUID.test(value))
  );
}

// Time zones span one day either side of UTC, never more.
function isNearToday(day: string, now: Date): boolean {
  const [y, m, d] = day.split("-").map(Number);
  const serverDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.abs(Date.UTC(y, m - 1, d) - serverDay) <= DAY_MS;
}

export type ParsedStatusRequest =
  | { ok: true; request: CustomerStatusRequest }
  | { ok: false; message: string };

export function parseCustomerStatusRequest(
  body: Record<string, unknown>,
  now: Date,
): ParsedStatusRequest {
  const {
    search = "",
    filters,
    sort = "name",
    branch = null,
    offset,
    limit,
    today,
  } = body;
  if (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH)
    return { ok: false, message: "The search text is too long." };
  if (!isCustomerFilterQuery(filters))
    return { ok: false, message: "Unknown customer filter." };
  if (!isCustomerSort(sort))
    return { ok: false, message: "Unknown customer sort." };
  if (!isBranchFilter(branch))
    return { ok: false, message: "Unknown branch." };
  if (!isWholeNumber(offset, 0, Number.MAX_SAFE_INTEGER))
    return { ok: false, message: "The page offset is not valid." };
  if (!isWholeNumber(limit, 1, MAX_STATUS_PAGE_SIZE))
    return {
      ok: false,
      message: `A page holds 1 to ${MAX_STATUS_PAGE_SIZE} customers.`,
    };
  if (
    typeof today !== "string" ||
    !isValidDateString(today) ||
    !isNearToday(today, now)
  )
    return {
      ok: false,
      message: "Your device date looks wrong. Check it and try again.",
    };
  return {
    ok: true,
    request: { search, filters, sort, branch, offset, limit, today },
  };
}
