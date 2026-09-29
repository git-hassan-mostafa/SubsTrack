import type { ExpenseCategory } from "@shared/core/types";

export const EXPENSE_CATEGORIES: {
  code: ExpenseCategory;
  labelKey: string;
}[] = [
  { code: "rent", labelKey: "expenses.cat_rent" },
  { code: "salaries", labelKey: "expenses.cat_salaries" },
  { code: "utilities", labelKey: "expenses.cat_utilities" },
  { code: "fuel", labelKey: "expenses.cat_fuel" },
  { code: "transport", labelKey: "expenses.cat_transport" },
  { code: "maintenance", labelKey: "expenses.cat_maintenance" },
  { code: "equipment", labelKey: "expenses.cat_equipment" },
  { code: "internet", labelKey: "expenses.cat_internet" },
  { code: "taxes", labelKey: "expenses.cat_taxes" },
  { code: "marketing", labelKey: "expenses.cat_marketing" },
  { code: "other", labelKey: "expenses.cat_other" },
];

export const STOCK_CATEGORY = {
  code: "stock" as const,
  labelKey: "expenses.cat_stock",
};

const BY_CODE = new Map(
  [...EXPENSE_CATEGORIES, STOCK_CATEGORY].map((c) => [c.code as string, c]),
);

export function isExpenseCategory(code: string): boolean {
  return BY_CODE.has(code);
}

export function expenseCategoryLabelKey(code: ExpenseCategory): string {
  return BY_CODE.get(code)?.labelKey ?? "expenses.cat_other";
}
