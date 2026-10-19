import type { CustomerDebts, DebtsView, OpenItem } from "@shared/core/types";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import { buildOwedView, customerOwedItems } from "@shared/modules/ledger/utils/owedView";
import { writeOffItems } from "@shared/modules/ledger/utils/writeOffItems";

export type OwedShow = "all" | "debts" | "months";

export const OWED_SHOW_LABEL_KEYS: Record<OwedShow, string> = {
  all: "debts.show_all",
  debts: "debts.show_debts",
  months: "debts.show_months",
};

export function isOwedShow(value: unknown): value is OwedShow {
  return value === "all" || value === "debts" || value === "months";
}

// A view over the held list, never a re-read — gotcha #121.
export function showOwed(view: DebtsView, show: OwedShow): DebtsView {
  if (show === "all") return view;
  const wantDebts = show === "debts";
  return buildOwedView(
    view.customers
      .flatMap(customerOwedItems)
      .filter((item) => item.isDebt === wantDebts),
  );
}

export function filterOwingCustomers(
  debtors: CustomerDebts[],
  search: string,
): CustomerDebts[] {
  const term = search.trim().toLowerCase();
  if (!term) return debtors;
  return debtors.filter((d) => d.customerName.toLowerCase().includes(term));
}

export type OwingCustomerActionKey = "collect_all" | "write_off_everything";

export type OwingCustomerMenuItem = MenuItem<OwingCustomerActionKey>;

const MENU: MenuTable<OwingCustomerActionKey> = {
  collect_all: {
    group: "money",
    labelKey: "ledger.collect_all",
    captionKey: "ledger.collect_all_caption",
  },
  write_off_everything: {
    group: "danger",
    labelKey: "ledger.write_off_everything",
    captionKey: "ledger.write_off_everything_caption",
    destructive: true,
  },
};

// Gives up everything the row shows — debts and unpaid months alike (#186).
export function owingCustomerActions(items: readonly OpenItem[]): OwingCustomerMenuItem[] {
  return pickMenu(MENU, ["collect_all", "write_off_everything"], {
    collect_all: items.length === 0 && "why_disabled.nothing_owed",
    write_off_everything:
      writeOffItems([...items]).length === 0 && "why_disabled.nothing_to_write_off",
  });
}
