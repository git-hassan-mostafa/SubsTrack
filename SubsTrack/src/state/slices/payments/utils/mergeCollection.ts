import type { Collection, MonthBill } from "@/src/core/types";

/**
 * Add one hand-over's money to the bills in the store.
 *
 * A month bill is either already held (add what reached it) or was just
 * materialized by this very collect (the item carries the new charge, so add the
 * whole bill). Non-month items — a sale, a custom fee — are not the grid's
 * business and are skipped. `collection.items` is always loaded here: both
 * repositories return the created row through `findById`.
 */
export function mergeCollection(bills: MonthBill[], collection: Collection): MonthBill[] {
  const paid = new Map<string, number>();
  const raised = new Map<string, MonthBill>();
  for (const item of collection.items ?? []) {
    paid.set(item.chargeId, (paid.get(item.chargeId) ?? 0) + item.amount);
    const charge = item.charge;
    if (charge?.kind === "month") raised.set(charge.id, { charge, collected: 0 });
  }
  const merged = bills.map((b) => {
    const extra = paid.get(b.charge.id);
    raised.delete(b.charge.id);
    return extra ? { ...b, collected: b.collected + extra } : b;
  });
  // Whatever is left was billed for the first time by this collect.
  for (const bill of raised.values()) {
    merged.push({ ...bill, collected: paid.get(bill.charge.id) ?? 0 });
  }
  return merged;
}
