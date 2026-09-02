import type { Collection, MonthBill } from "@/src/core/types";

/**
 * Move one hand-over's money in or out of the bills in the store.
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
 *
 * `sign` is -1 when that hand-over was VOIDED: the money comes back off every
 * bill it had settled, and an emptied bill is kept rather than dropped — a bill
 * with nothing collected already reads exactly like a month never billed (#106).
 */
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
    paid.set(item.chargeId, (paid.get(item.chargeId) ?? 0) + sign * item.amount);
    // A void can only empty a bill that is already held — it raises none.
    if (sign === 1 && charge?.kind === "month") raised.set(charge.id, { charge, collected: 0 });
  }
  const merged = bills.map((b) => {
    const extra = paid.get(b.charge.id);
    // The write may have RE-PRICED an empty bill (#106b), so the row it returned
    // wins over the stale one held here — otherwise a settled month reads
    // "PARTIAL 25/30" until something forces a reload.
    const written = raised.get(b.charge.id)?.charge;
    raised.delete(b.charge.id);
    if (!extra) return written ? { ...b, charge: written } : b;
    return {
      ...b,
      charge: written ?? b.charge,
      collected: Math.max(0, b.collected + extra),
    };
  });
  // Whatever is left was billed for the first time by this collect.
  for (const bill of raised.values()) {
    merged.push({ ...bill, collected: paid.get(bill.charge.id) ?? 0 });
  }
  return merged;
}
