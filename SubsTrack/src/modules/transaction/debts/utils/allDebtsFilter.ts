import type { ChargeKind, DebtsView, OpenItem } from "@/src/core/types";
import { compareOpenItems } from "@/src/modules/ledger/utils/waterfall";
import { daysLate } from "@/src/core/utils/date";

export type AllDebtsStatus = "late" | "not_late" | "partial";
export type AllDebtsSort =
  | "created"
  | "updated"
  | "oldest"
  | "newest"
  | "largest"
  | "smallest";

export interface AllDebtsFilters {
  search: string;
  kind: ChargeKind | null;
  status: AllDebtsStatus | null;
  sort: AllDebtsSort;
}

export const DEFAULT_ALL_DEBTS_FILTERS: AllDebtsFilters = {
  search: "",
  kind: null,
  status: null,
  sort: "created",
};

export function hasActiveAllDebtsFilters(f: AllDebtsFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.kind !== null ||
    f.status !== null ||
    f.sort !== DEFAULT_ALL_DEBTS_FILTERS.sort
  );
}

// Every DEBT row of every customer, flattened. Unpaid months stay out on
// purpose — the Debts screen counts them apart, and so must this sheet.
export function flattenDebts(view: DebtsView | null): OpenItem[] {
  if (!view) return [];
  return view.customers.flatMap((c) => c.items);
}

function matchesStatus(
  item: OpenItem,
  status: AllDebtsStatus,
  today: Date,
): boolean {
  if (status === "partial") return item.paid > 0;
  const late = daysLate(item.dueDate, today) > 0;
  return status === "late" ? late : !late;
}

function usdOf(item: OpenItem): number {
  return item.balance / item.ratePerUsdSnapshot;
}

function updatedAtOf(item: OpenItem): string {
  return item.charge?.updatedAt ?? item.createdAt;
}

// Every sort falls back to the waterfall order, so ties never swap on render.
function compareBy(sort: AllDebtsSort, a: OpenItem, b: OpenItem): number {
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

// The written-off scope arrives as a flat list of its own, so the filters live
// here rather than on the flatten — one rule set, both scopes.
export function filterAndSortDebts(
  items: OpenItem[],
  filters: AllDebtsFilters,
  today: Date = new Date(),
): OpenItem[] {
  const q = filters.search.trim().toLowerCase();
  const rows = items.filter((item) => {
    if (filters.kind && item.kind !== filters.kind) return false;
    if (filters.status && !matchesStatus(item, filters.status, today))
      return false;
    if (!q) return true;
    return (
      item.customerName.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q)
    );
  });
  return rows.sort((a, b) => compareBy(filters.sort, a, b));
}

export function selectAllDebts(
  view: DebtsView | null,
  filters: AllDebtsFilters,
  today: Date = new Date(),
): OpenItem[] {
  return filterAndSortDebts(flattenDebts(view), filters, today);
}

export function totalUsdOf(items: OpenItem[]): number {
  return items.reduce((sum, i) => sum + usdOf(i), 0);
}
