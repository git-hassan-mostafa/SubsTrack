import { ADMIN_ONLY, pickMenu, type MenuItem, type MenuTable } from "./menuItem";

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

// Expenses and stock are admin-only, so staff see their shortcuts greyed.
export function quickActionItems(viewer: { isAdmin: boolean }): QuickActionItem[] {
  const adminOnly = !viewer.isAdmin && ADMIN_ONLY;
  return pickMenu(
    MENU,
    ["collect", "customer", "sale", "customDebt", "expense", "batchRestock", "moneyReceived"],
    { expense: adminOnly, batchRestock: adminOnly },
  );
}
