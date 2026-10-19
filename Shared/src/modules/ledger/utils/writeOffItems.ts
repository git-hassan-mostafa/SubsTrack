import type { OpenItem } from "@shared/core/types";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";

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

// Stored bills plus priced unpaid months; a month gets its bill raised written off (#186).
export function writeOffItems(items: OpenItem[]): OpenItem[] {
  const picked = items.filter(
    (item) => item.chargeId !== null || isWriteOffMonth(item),
  );
  const byKey = new Map<string, OpenItem>();
  for (const item of picked) if (!byKey.has(keyOf(item))) byKey.set(keyOf(item), item);
  return [...byKey.values()];
}
