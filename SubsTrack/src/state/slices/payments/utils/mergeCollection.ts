import type { Collection, MonthBill } from "@/src/core/types";

/**
 * Add one hand-over's money to the bills in the store.
 *
 * A month bill is either already held (add what reached it) or was just
 * materialized by this very collect (the item carries the new charge, so add the
 * whole bill). Non-month items — a sale, a custom fee — are not the grid's
 * business and are skipped. `collection.items` is always loaded here: both
 * repositories return the created row through `findById`.
 *
 * Money on a DEAD bill (voided / written off) is dropped rather than painted
 * green. The write revives such a bill before the cash lands on it (#115), so
 * this cannot normally happen — and that is the point: if it ever does again,
 * the cell stays red immediately instead of turning green until the next
 * refresh, which is what hid the bug the first time.
 */
export function mergeCollection(bills: MonthBill[], collection: Collection): MonthBill[] {
  const paid = new Map<string, number>();
  const raised = new Map<string, MonthBill>();
  for (const item of collection.items ?? []) {
    const charge = item.charge;
    if (charge && (charge.voidedAt || charge.writtenOffAt)) continue;
    paid.set(item.chargeId, (paid.get(item.chargeId) ?? 0) + item.amount);
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
