import type { OpenItem } from "@shared/core/types";
import { daysLate } from "@shared/core/utils/date";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import { isEditableCustomDebt } from "./customDebtForm";

export type DebtItemActionKey =
  | "collect"
  | "revert_write_off"
  | "edit"
  | "write_off"
  | "remove";

export interface DebtItemFacts {
  writtenOff: boolean;
  daysLate: number;
  partlyPaid: boolean;
}

// A debt row shows a chip only when something is wrong with the bill.
export function debtItemFacts(
  item: OpenItem,
  today: Date = new Date(),
): DebtItemFacts {
  return {
    writtenOff: item.charge?.writtenOffAt != null,
    daysLate: daysLate(item.dueDate, today),
    partlyPaid: item.paid > 0,
  };
}

export type DebtMenuItem = MenuItem<DebtItemActionKey>;

const WRITTEN_OFF = "why_disabled.written_off";

const MENU: MenuTable<DebtItemActionKey> = {
  collect: { group: "money", labelKey: "payments.collect" },
  revert_write_off: {
    group: "manage",
    labelKey: "ledger.revert_write_off",
    captionKey: "ledger.revert_write_off_caption",
  },
  edit: { group: "manage", labelKey: "common.edit" },
  write_off: {
    group: "danger",
    labelKey: "ledger.write_off",
    captionKey: "ledger.write_off_caption",
  },
  remove: { group: "danger", labelKey: "debts.remove", destructive: true },
};

export function debtItemActions(item: OpenItem): DebtMenuItem[] {
  const writtenOff = item.charge?.writtenOffAt != null && WRITTEN_OFF;
  const billed = item.chargeId !== null;
  const notCustom =
    !isEditableCustomDebt(item) && (writtenOff || "why_disabled.custom_debt_only");
  const keys: DebtItemActionKey[] = [
    "collect",
    writtenOff ? "revert_write_off" : "write_off",
    "edit",
    "remove",
  ];
  return pickMenu(MENU, keys, {
    collect: writtenOff,
    write_off: !billed && "why_disabled.not_billed",
    edit: notCustom,
    remove: notCustom,
  });
}
