import type { ChargeKind, DebtsView, OpenItem } from "@shared/core/types";
import { compareOpenItems } from "@shared/modules/ledger/utils/waterfall";
import { daysLate } from "@shared/core/utils/date";
import { balanceUsd } from "@shared/modules/ledger/utils/debtRule";
import { customerOwedItems } from "@shared/modules/ledger/utils/owedView";

export type AllItemsStatus = "late" | "not_late" | "partial";
export type AllItemsSort =
  | "created"
  | "updated"
  | "oldest"
  | "newest"
  | "largest"
  | "smallest";

export const OWED_KINDS: readonly ChargeKind[] = ["month", "sale", "manual"];

export const ALL_ITEMS_STATUSES: readonly AllItemsStatus[] = [
  "late",
  "not_late",
  "partial",
];

export const ALL_ITEMS_SORTS: readonly AllItemsSort[] = [
  "created",
  "updated",
  "oldest",
  "newest",
  "largest",
  "smallest",
];

export interface AllItemsFilters {
  search: string;
  kind: readonly ChargeKind[];
  status: readonly AllItemsStatus[];
  sort: AllItemsSort;
}

export const DEFAULT_ALL_ITEMS_FILTERS: AllItemsFilters = {
  search: "",
  kind: [],
  status: [],
  sort: "created",
};

export function hasActiveAllItemsFilters(f: AllItemsFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.kind.length > 0 ||
    f.status.length > 0 ||
    f.sort !== DEFAULT_ALL_ITEMS_FILTERS.sort
  );
}

// Every row the page's view holds, so this list and the page total agree.
export function flattenOwed(view: DebtsView | null): OpenItem[] {
  if (!view) return [];
  return view.customers.flatMap(customerOwedItems);
}

function matchesStatus(
  item: OpenItem,
  status: AllItemsStatus,
  today: Date,
): boolean {
  if (status === "partial") return item.paid > 0;
  const late = daysLate(item.dueDate, today) > 0;
  return status === "late" ? late : !late;
}

function usdOf(item: OpenItem): number {
  return balanceUsd(item.balance, item.ratePerUsdSnapshot);
}

function updatedAtOf(item: OpenItem): string {
  return item.charge?.updatedAt ?? item.createdAt;
}

// Every sort falls back to the waterfall order, so ties never swap on render.
function compareBy(sort: AllItemsSort, a: OpenItem, b: OpenItem): number {
  if (sort === "oldest") return compareOpenItems(a, b);
  if (sort === "newest") return -compareOpenItems(a, b);
  if (sort === "created")
    return b.createdAt.localeCompare(a.createdAt) || compareOpenItems(a, b);
  if (sort === "updated")
    return (
      updatedAtOf(b).localeCompare(updatedAtOf(a)) || compareOpenItems(a, b)
    );
  const byAmount =
    sort === "largest" ? usdOf(b) - usdOf(a) : usdOf(a) - usdOf(b);
  return byAmount !== 0 ? byAmount : compareOpenItems(a, b);
}

// Every debt list shares this, so a customer's debts read in one order anywhere.
export function sortOwed(
  items: OpenItem[],
  sort: AllItemsSort = DEFAULT_ALL_ITEMS_FILTERS.sort,
): OpenItem[] {
  return [...items].sort((a, b) => compareBy(sort, a, b));
}

// Filters live on the flat list so written-off and debts share one rule set.
export function filterAndSortOwed(
  items: OpenItem[],
  filters: AllItemsFilters,
  today: Date = new Date(),
): OpenItem[] {
  const q = filters.search.trim().toLowerCase();
  const rows = items.filter((item) => {
    if (filters.kind.length > 0 && !filters.kind.includes(item.kind)) return false;
    if (
      filters.status.length > 0 &&
      !filters.status.some((s) => matchesStatus(item, s, today))
    )
      return false;
    if (!q) return true;
    return (
      item.customerName.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q)
    );
  });
  return sortOwed(rows, filters.sort);
}

export function selectAllOwed(
  view: DebtsView | null,
  filters: AllItemsFilters,
  today: Date = new Date(),
): OpenItem[] {
  return filterAndSortOwed(flattenOwed(view), filters, today);
}

export function totalUsdOf(items: OpenItem[]): number {
  return items.reduce((sum, i) => sum + usdOf(i), 0);
}
