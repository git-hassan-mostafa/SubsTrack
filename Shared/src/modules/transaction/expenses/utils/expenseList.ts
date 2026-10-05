import type { ExpenseCategory, ExpenseItem, ExpenseSummary } from "@shared/core/types";
import { sumUsd } from "@shared/core/utils/currency";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import type { Tone } from "@shared/shared/lib/tone";
import type { PeriodPreset } from "@shared/core/utils/dateRange";

export type ExpenseCategoryFilter = ExpenseCategory | "all";

export const EXPENSE_DEFAULT_PRESET: PeriodPreset = "this_month";

export interface ExpenseListFilter {
  search: string;
  category: ExpenseCategoryFilter;
}

export interface ExpenseBreakdown {
  stockUsd: number;
  manualUsd: number;
}

export interface ExpenseListView {
  rows: ExpenseItem[];
  totalUsd: number;
  breakdown: ExpenseBreakdown | null;
  filtered: boolean;
}

export type ExpenseActionKey = "product" | "remove";

export const EXPENSE_SOURCE_TONE: Record<ExpenseItem["source"], Tone> = {
  stock: "indigo",
  manual: "amber",
};

const EXPENSE_MENU: MenuTable<ExpenseActionKey> = {
  product: { group: "open", labelKey: "expenses.open_product" },
  remove: { group: "danger", labelKey: "expenses.remove", destructive: true },
};

export function filterExpenses(
  items: ExpenseItem[],
  filter: ExpenseListFilter,
): ExpenseItem[] {
  const term = filter.search.trim().toLowerCase();
  return items.filter(
    (item) =>
      (filter.category === "all" || item.category === filter.category) &&
      (!term || item.label.toLowerCase().includes(term)),
  );
}

// Split shown only for the whole window; a month of credits nets negative.
export function expenseListView(
  items: ExpenseItem[],
  summary: ExpenseSummary,
  filter: ExpenseListFilter,
): ExpenseListView {
  const rows = filterExpenses(items, filter);
  const filtered = rows.length !== items.length;
  const split = !filtered && summary.stockUsd !== 0 && summary.manualUsd !== 0;
  return {
    rows,
    totalUsd: filtered ? sumUsd(rows) : summary.totalUsd,
    breakdown: split
      ? { stockUsd: summary.stockUsd, manualUsd: summary.manualUsd }
      : null,
    filtered,
  };
}

// A stock row is fixed on its entry, never removed here — gotcha #89.
export function expenseMenuItems(
  item: Pick<ExpenseItem, "source" | "productId" | "canVoid">,
): MenuItem<ExpenseActionKey>[] {
  const keys: ExpenseActionKey[] = [];
  if (item.source === "stock" && item.productId) keys.push("product");
  if (item.canVoid) keys.push("remove");
  return pickMenu(EXPENSE_MENU, keys);
}
