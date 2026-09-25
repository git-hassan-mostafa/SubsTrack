import type { Collection, OpenItem } from "@/src/core/types";
import { isDebtItem } from "./openItems";
import { amountByCharge } from "./paidToCharge";
import { roundMoney } from "./waterfall";

// The bills a hand-over paid, owing what they would owe had it never happened.
export function withoutCollection(
  bills: OpenItem[],
  collection: Pick<Collection, "items">,
): OpenItem[] {
  const own = amountByCharge(collection.items ?? []);
  return bills.map((bill) => {
    const paid = roundMoney(
      bill.paid - (bill.chargeId ? (own.get(bill.chargeId) ?? 0) : 0),
    );
    return {
      ...bill,
      paid,
      balance: roundMoney(bill.amount - paid),
      isDebt: isDebtItem(bill.kind, paid),
    };
  });
}

// A voided or written-off bill is closed — reopen it before correcting.
export function hasClosedBill(bills: OpenItem[]): boolean {
  return bills.some(
    (bill) => !!bill.charge?.voidedAt || !!bill.charge?.writtenOffAt,
  );
}
