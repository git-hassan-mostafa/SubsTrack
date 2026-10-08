import type { OpenItem } from "@shared/core/types";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";

export type WriteOffReach = "debts" | "everything";

// A month with no set price has no amount to give up, so it is never written off.
export function isWriteOffMonth(item: OpenItem): boolean {
  return (
    item.chargeId === null &&
    item.kind === "month" &&
    !item.openAmount &&
    item.amount > 0 &&
    !!item.customerPlanId &&
    !!item.billingMonth
  );
}

// "Debts" never reaches an unpaid month: a month is owed, not a debt (#186).
export function writeOffItems(
  items: OpenItem[],
  reach: WriteOffReach,
): OpenItem[] {
  const picked = items.filter((item) =>
    reach === "debts"
      ? item.chargeId !== null && item.isDebt
      : item.chargeId !== null || isWriteOffMonth(item),
  );
  const byKey = new Map<string, OpenItem>();
  for (const item of picked) if (!byKey.has(keyOf(item))) byKey.set(keyOf(item), item);
  return [...byKey.values()];
}
