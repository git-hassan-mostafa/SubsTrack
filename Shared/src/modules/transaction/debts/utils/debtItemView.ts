import type { OpenItem } from "@shared/core/types";
import { daysLate } from "@shared/core/utils/date";
import type { ActionGroup } from "@shared/shared/lib/actionOrder";
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

export interface DebtMenuItem {
  key: DebtItemActionKey;
  group: ActionGroup;
  labelKey: string;
  captionKey?: string;
  destructive?: boolean;
}

const MENU: Record<DebtItemActionKey, Omit<DebtMenuItem, "key">> = {
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
  const writtenOff = item.charge?.writtenOffAt != null;
  const billed = item.chargeId !== null;
  const custom = isEditableCustomDebt(item);
  const keys: DebtItemActionKey[] = [];
  if (!writtenOff) keys.push("collect");
  if (writtenOff && billed) keys.push("revert_write_off");
  if (custom) keys.push("edit");
  if (billed && !writtenOff) keys.push("write_off");
  if (custom) keys.push("remove");
  return keys.map((key) => ({ key, ...MENU[key] }));
}
