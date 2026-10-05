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
  { code: "spare_parts", labelKey: "expenses.cat_spare_parts" },
  { code: "equipment", labelKey: "expenses.cat_equipment" },
  { code: "supplies", labelKey: "expenses.cat_supplies" },
  { code: "internet", labelKey: "expenses.cat_internet" },
  { code: "phone", labelKey: "expenses.cat_phone" },
  { code: "software", labelKey: "expenses.cat_software" },
  { code: "commissions", labelKey: "expenses.cat_commissions" },
  { code: "taxes", labelKey: "expenses.cat_taxes" },
  { code: "bank_fees", labelKey: "expenses.cat_bank_fees" },
  { code: "insurance", labelKey: "expenses.cat_insurance" },
  { code: "professional_fees", labelKey: "expenses.cat_professional_fees" },
  { code: "marketing", labelKey: "expenses.cat_marketing" },
  { code: "meals", labelKey: "expenses.cat_meals" },
  { code: "cleaning", labelKey: "expenses.cat_cleaning" },
  { code: "donations", labelKey: "expenses.cat_donations" },
  { code: "other", labelKey: "expenses.cat_other" },
];

export const STOCK_CATEGORY = {
  code: "stock" as const,
  labelKey: "expenses.cat_stock",
};

export const EXPENSE_FILTER_CATEGORIES: {
  code: ExpenseCategory;
  labelKey: string;
}[] = [...EXPENSE_CATEGORIES, STOCK_CATEGORY];

const BY_CODE = new Map(
  EXPENSE_FILTER_CATEGORIES.map((c) => [c.code as string, c]),
);

export function isExpenseCategory(code: string): boolean {
  return BY_CODE.has(code);
}

export function expenseCategoryLabelKey(code: ExpenseCategory): string {
  return BY_CODE.get(code)?.labelKey ?? "expenses.cat_other";
}
