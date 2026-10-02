import type { CustomerDebts, OpenItem } from "@shared/core/types";

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
