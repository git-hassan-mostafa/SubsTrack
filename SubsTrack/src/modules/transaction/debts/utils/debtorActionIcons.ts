import type { Glyph } from "@/src/shared/lib/menuActions";
import type { DebtorActionKey } from "@shared/modules/transaction/debts/utils/debtorView";

export const DEBTOR_ACTION_ICONS: Record<DebtorActionKey, Glyph> = {
  collect_all: "cash-outline",
  write_off_all: "remove-circle-outline",
};
