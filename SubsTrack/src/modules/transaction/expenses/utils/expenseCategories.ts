import type { Ionicons } from '@expo/vector-icons';
import type { ExpenseCategory } from '@/src/core/types';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * The one table every category label and icon reads — the dropdown, the list
 * card, and (later) the reporting page. Adding a category is one line here plus
 * its i18n key; the DB column is free text, so there is no migration.
 */
export const EXPENSE_CATEGORIES: {
  code: ExpenseCategory;
  labelKey: string;
  icon: IconName;
}[] = [
  { code: 'rent', labelKey: 'expenses.cat_rent', icon: 'business-outline' },
  { code: 'salaries', labelKey: 'expenses.cat_salaries', icon: 'people-outline' },
  { code: 'utilities', labelKey: 'expenses.cat_utilities', icon: 'flash-outline' },
  { code: 'fuel', labelKey: 'expenses.cat_fuel', icon: 'flame-outline' },
  { code: 'transport', labelKey: 'expenses.cat_transport', icon: 'car-outline' },
  { code: 'maintenance', labelKey: 'expenses.cat_maintenance', icon: 'construct-outline' },
  { code: 'equipment', labelKey: 'expenses.cat_equipment', icon: 'hardware-chip-outline' },
  { code: 'internet', labelKey: 'expenses.cat_internet', icon: 'globe-outline' },
  { code: 'taxes', labelKey: 'expenses.cat_taxes', icon: 'document-text-outline' },
  { code: 'marketing', labelKey: 'expenses.cat_marketing', icon: 'megaphone-outline' },
  { code: 'other', labelKey: 'expenses.cat_other', icon: 'ellipsis-horizontal-outline' },
];

/** Stock is derived from the ledger, never hand-picked, so it is kept out of
 *  EXPENSE_CATEGORIES (which is exactly what the form's dropdown offers). */
export const STOCK_CATEGORY = {
  code: 'stock' as const,
  labelKey: 'expenses.cat_stock',
  icon: 'cube-outline' as IconName,
};

const BY_CODE = new Map(
  [...EXPENSE_CATEGORIES, STOCK_CATEGORY].map((c) => [c.code as string, c]),
);

export function isExpenseCategory(code: string): boolean {
  return BY_CODE.has(code);
}

export function expenseCategoryLabelKey(code: ExpenseCategory): string {
  return BY_CODE.get(code)?.labelKey ?? 'expenses.cat_other';
}

export function expenseCategoryIcon(code: ExpenseCategory): IconName {
  return BY_CODE.get(code)?.icon ?? 'ellipsis-horizontal-outline';
}
