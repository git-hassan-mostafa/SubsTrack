import type { OpenItem } from "@shared/core/types";
import { daysLate } from "@shared/core/utils/date";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import { isEditableCustomDebt } from "../../debts/utils/customDebtForm";

export type OwedItemActionKey =
  | "collect"
  | "revert_write_off"
  | "edit"
  | "write_off"
  | "remove";

export interface OwedItemFacts {
  writtenOff: boolean;
  daysLate: number;
  partlyPaid: boolean;
  unpaidMonth: boolean;
}

// Chips tell an untouched month from a part-paid one, and flag what is wrong.
export function owedItemFacts(
  item: OpenItem,
  today: Date = new Date(),
): OwedItemFacts {
  return {
    writtenOff: item.charge?.writtenOffAt != null,
    daysLate: daysLate(item.dueDate, today),
    partlyPaid: item.paid > 0,
    unpaidMonth: item.kind === "month" && item.paid <= 0,
  };
}

export type OwedMenuItem = MenuItem<OwedItemActionKey>;

const WRITTEN_OFF = "why_disabled.written_off";

const MENU: MenuTable<OwedItemActionKey> = {
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

export function owedItemActions(item: OpenItem): OwedMenuItem[] {
  const writtenOff = item.charge?.writtenOffAt != null && WRITTEN_OFF;
  const billed = item.chargeId !== null;
  const notCustom =
    !isEditableCustomDebt(item) && (writtenOff || "why_disabled.custom_debt_only");
  const keys: OwedItemActionKey[] = [
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
