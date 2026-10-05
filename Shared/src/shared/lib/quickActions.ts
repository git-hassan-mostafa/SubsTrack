import { pickMenu, type MenuItem, type MenuTable } from "./menuItem";

export type QuickActionKey =
  | "collect"
  | "customer"
  | "sale"
  | "customDebt"
  | "expense"
  | "batchRestock"
  | "moneyReceived";

export type QuickActionItem = MenuItem<QuickActionKey>;

const MENU: MenuTable<QuickActionKey> = {
  collect: { group: "money", labelKey: "ledger.collect_money" },
  customer: { group: "create", labelKey: "customers.add" },
  sale: { group: "create", labelKey: "sales.record_button" },
  customDebt: { group: "create", labelKey: "debts.add_custom_debt" },
  expense: { group: "create", labelKey: "expenses.add_title" },
  batchRestock: { group: "create", labelKey: "products.batch_restock_title" },
  moneyReceived: { group: "history", labelKey: "ledger.history_title" },
};

// Expenses and stock are admin-only, so their shortcuts are too.
export function quickActionItems(viewer: { isAdmin: boolean }): QuickActionItem[] {
  const keys: QuickActionKey[] = ["collect", "customer", "sale", "customDebt"];
  if (viewer.isAdmin) keys.push("expense", "batchRestock");
  keys.push("moneyReceived");
  return pickMenu(MENU, keys);
}
