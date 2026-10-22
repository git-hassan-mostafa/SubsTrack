import type { Collection, MonthBill } from "@shared/core/types";

// One hand-over's money in (or, voided, out of) the held bills — #115, #116e.
export function mergeCollection(
  bills: MonthBill[],
  collection: Collection,
  sign: 1 | -1 = 1,
): MonthBill[] {
  const paid = new Map<string, number>();
  const raised = new Map<string, MonthBill>();
  for (const item of collection.items ?? []) {
    const charge = item.charge;
    if (charge && (charge.voidedAt || charge.writtenOffAt)) continue;
    paid.set(
      item.chargeId,
      (paid.get(item.chargeId) ?? 0) + sign * item.amount,
    );
    if (sign === 1 && charge?.kind === "month")
      raised.set(charge.id, { charge, collected: 0 });
  }
  const payersAfter = (bill: MonthBill): string[] => {
    const others = (bill.collectionIds ?? []).filter((id) => id !== collection.id);
    return sign === 1 ? [...others, collection.id] : others;
  };
  const merged = bills.map((b) => {
    const extra = paid.get(b.charge.id);
    const written = raised.get(b.charge.id)?.charge;
    raised.delete(b.charge.id);
    if (!extra) return written ? { ...b, charge: written } : b;
    return {
      ...b,
      charge: written ?? b.charge,
      collected: Math.max(0, b.collected + extra),
      collectionIds: payersAfter(b),
    };
  });
  for (const bill of raised.values()) {
    merged.push({
      ...bill,
      collected: paid.get(bill.charge.id) ?? 0,
      collectionIds: [collection.id],
    });
  }
  return merged;
}
