import type { CustomerDebts, OpenItem } from "@shared/core/types";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";

// What collecting "everything" pours over: the debts AND the part-paid months.
export function debtorOwedItems(debtor: CustomerDebts): OpenItem[] {
  return [...debtor.items, ...debtor.unpaidMonths];
}

export function debtorOwedUsd(debtor: CustomerDebts): number {
  return debtor.debtUsd + debtor.unpaidMonthsUsd;
}

export function filterDebtors(
  debtors: CustomerDebts[],
  search: string,
): CustomerDebts[] {
  const term = search.trim().toLowerCase();
  if (!term) return debtors;
  return debtors.filter((d) => d.customerName.toLowerCase().includes(term));
}

export type DebtorActionKey = "collect_all" | "write_off_all";

export type DebtorMenuItem = MenuItem<DebtorActionKey>;

const MENU: MenuTable<DebtorActionKey> = {
  collect_all: {
    group: "money",
    labelKey: "ledger.collect_all",
    captionKey: "ledger.collect_all_caption",
  },
  write_off_all: {
    group: "danger",
    labelKey: "ledger.write_off_all",
    captionKey: "ledger.write_off_all_caption",
    destructive: true,
  },
};

// A virtual month has no bill to write off, so only billed rows offer it.
export function debtorActions(items: readonly OpenItem[]): DebtorMenuItem[] {
  const keys: DebtorActionKey[] = [];
  if (items.length > 0) keys.push("collect_all");
  if (items.some((item) => item.chargeId !== null)) keys.push("write_off_all");
  return pickMenu(MENU, keys);
}
