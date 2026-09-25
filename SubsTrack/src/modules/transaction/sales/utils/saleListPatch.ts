import type { Collection, Sale } from "@/src/core/types";
import { amountByCharge } from "@/src/modules/ledger/utils/paidToCharge";

/** Newest first, which is how every sales list is sorted. */
export function addSale(items: Sale[], sale: Sale): Sale[] {
  return [sale, ...items];
}

/**
 * Swaps the corrected sale in place. `belongs` is what a customer-scoped list
 * passes to drop a sale an edit moved to another customer.
 */
export function replaceSale(
  items: Sale[],
  sale: Sale,
  belongs: (sale: Sale) => boolean = () => true,
): Sale[] {
  if (!belongs(sale)) return items.filter((s) => s.id !== sale.id);
  return items.map((s) => (s.id === sale.id ? sale : s));
}

/** A voided sale leaves a list that hides voided rows. */
export function removeSales(items: Sale[], ids: Iterable<string>): Sale[] {
  const gone = new Set(ids);
  return items.filter((s) => !gone.has(s.id));
}

/**
 * What a void does to a list that may be SHOWING voided rows. The Sales tab's
 * status filter decides: a list admitting them keeps the row in place, marked,
 * so voiding it does not make the record vanish from under the reader.
 */
export function applyVoidedSales(
  items: Sale[],
  voided: Sale[],
  keepVoided: boolean,
): Sale[] {
  if (!keepVoided)
    return removeSales(
      items,
      voided.map((s) => s.id),
    );
  const byId = new Map(voided.map((s) => [s.id, s]));
  return items.map((s) => byId.get(s.id) ?? s);
}

// Money in (1) or out (-1) on the sales whose bills this hand-over names.
export function applyCollectionToSales(
  items: Sale[],
  collection: Pick<Collection, "items">,
  sign: 1 | -1 = 1,
): Sale[] {
  const paidByCharge = amountByCharge(collection.items ?? []);
  if (paidByCharge.size === 0) return items;
  return items.map((s) => {
    const paid = s.chargeId ? paidByCharge.get(s.chargeId) : undefined;
    if (paid === undefined) return s;
    return { ...s, amountPaid: Math.max(0, s.amountPaid + sign * paid) };
  });
}

/**
 * Stamp a bill's write-off onto the sale that owns it, so the card's chip and
 * its greyed amount follow the write without the list re-reading.
 */
export function applyWriteOffToSales(
  items: Sale[],
  chargeId: string,
  writtenOffAt: string | null,
): Sale[] {
  return items.map((s) =>
    s.chargeId === chargeId && s.charge
      ? { ...s, charge: { ...s.charge, writtenOffAt } }
      : s,
  );
}

/** A sale's value in USD — what a month section header sums. */
export function saleUsd(sale: Sale): number {
  return sale.totalAmount / sale.ratePerUsdSnapshot;
}

// No sale VOID: its hand-overs may have paid other sales, so lists re-read.
export interface SalePatches {
  created: (sale: Sale) => void;
  updated: (sale: Sale) => void;
  collected: (collection: Collection) => void;
  paymentChanged: (voided: Collection, replacement?: Collection) => void;
  writeOffChanged: (chargeId: string, writtenOffAt: string | null) => void;
}

// A customer-scoped list's patches; an edit that moved the sale away drops it.
export function saleListPatches(
  setItems: (fn: (prev: Sale[]) => Sale[]) => void,
  customerId: string | undefined,
): SalePatches {
  return {
    created: (sale) => setItems((prev) => addSale(prev, sale)),
    updated: (sale) =>
      setItems((prev) =>
        replaceSale(prev, sale, (s) => s.customerId === customerId),
      ),
    collected: (collection) =>
      setItems((prev) => applyCollectionToSales(prev, collection)),
    paymentChanged: (voided, replacement) =>
      setItems((prev) => {
        const undone = applyCollectionToSales(prev, voided, -1);
        return replacement
          ? applyCollectionToSales(undone, replacement)
          : undone;
      }),
    writeOffChanged: (chargeId, writtenOffAt) =>
      setItems((prev) => applyWriteOffToSales(prev, chargeId, writtenOffAt)),
  };
}
