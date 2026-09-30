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
  CUSTOMER_TABS,
  isCustomerTab,
  matchesCustomerTab,
  type CustomerTab,
} from "@shared/modules/customer/customers/utils/customerTabs";
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

function byName(a: StatusListCustomer, b: StatusListCustomer): number {
  return (
    a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function emptyCounts(): Record<CustomerTab, number> {
  return Object.fromEntries(CUSTOMER_TABS.map((tab) => [tab, 0])) as Record<
    CustomerTab,
    number
  >;
}

// Exact tabs over every customer in scope; counts follow the search only.
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
  const found = facts.customers
    .filter((customer) => matchesCustomerSearch(customer, term))
    .sort(byName);

  const counts = emptyCounts();
  const inTab: CustomerStatusRow[] = [];
  for (const customer of found) {
    const row: CustomerStatusRow = {
      customerId: customer.id,
      status: statuses.get(customer.id) ?? null,
      debtUsd: facts.debtUsd.get(customer.id) ?? 0,
    };
    for (const tab of CUSTOMER_TABS) {
      if (!matchesCustomerTab(customer, row.status, row.debtUsd, tab))
        continue;
      counts[tab]++;
      if (tab === query.tab) inTab.push(row);
    }
  }

  return {
    rows: inTab.slice(query.offset, query.offset + query.limit),
    total: inTab.length,
    counts,
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
  const { search = "", tab, branch = null, offset, limit, today } = body;
  if (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH)
    return { ok: false, message: "The search text is too long." };
  if (!isCustomerTab(tab))
    return { ok: false, message: "Unknown customer tab." };
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
  return { ok: true, request: { search, tab, branch, offset, limit, today } };
}
