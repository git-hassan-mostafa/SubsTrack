import type { Collection, Sale } from '@/src/core/types';

/**
 * How a written sale changes a list of sales.
 *
 * Three surfaces show sales — the Transactions tab (the global slice) and the two
 * customer-scoped lists, which keep their own state so they never collide with
 * it. They must all react to a write identically, so the rules live here once and
 * nobody re-reads the table to find out what just happened.
 */

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
  if (!keepVoided) return removeSales(items, voided.map((s) => s.id));
  const byId = new Map(voided.map((s) => [s.id, s]));
  return items.map((s) => byId.get(s.id) ?? s);
}

/**
 * Money in (or back out) on whichever bills this hand-over settled.
 *
 * A sale holds no money — `amountPaid` is a sum over the collection items that
 * reached its bill — so a collect only moves the sales whose `chargeId` the
 * hand-over names. `sign` is -1 when that hand-over was voided.
 */
export function applyCollectionToSales(
  items: Sale[],
  // Only the split matters, so a history row (which carries one) works too.
  collection: Pick<Collection, 'items'>,
  sign: 1 | -1 = 1,
): Sale[] {
  const paidByCharge = new Map<string, number>();
  for (const item of collection.items ?? []) {
    paidByCharge.set(item.chargeId, (paidByCharge.get(item.chargeId) ?? 0) + item.amount);
  }
  if (paidByCharge.size === 0) return items;
  return items.map((s) => {
    const paid = s.chargeId ? paidByCharge.get(s.chargeId) : undefined;
    if (paid === undefined) return s;
    return { ...s, amountPaid: Math.max(0, s.amountPaid + sign * paid) };
  });
}

/** A sale's value in USD — what a month section header sums. */
export function saleUsd(sale: Sale): number {
  return sale.totalAmount / sale.ratePerUsdSnapshot;
}

/**
 * The writes a sales list patches itself for. A VOID is deliberately absent: it
 * takes the sale's hand-overs with it, and one of those may also have settled
 * another sale on the same list — which the write never names, so those screens
 * re-read instead.
 */
export interface SalePatches {
  created: (sale: Sale) => void;
  updated: (sale: Sale) => void;
  collected: (collection: Collection) => void;
  /** A hand-over against one of these sales was voided — its money goes back. */
  paymentVoided: (collection: Collection) => void;
}

/**
 * The patches a CUSTOMER-SCOPED list applies after a write, so the two such
 * lists behave identically. `customerId` is the scope: an edit that moved the
 * sale to another customer drops it from this list.
 */
export function saleListPatches(
  setItems: (fn: (prev: Sale[]) => Sale[]) => void,
  customerId: string | undefined,
): SalePatches {
  return {
    created: (sale) => setItems((prev) => addSale(prev, sale)),
    updated: (sale) =>
      setItems((prev) => replaceSale(prev, sale, (s) => s.customerId === customerId)),
    collected: (collection) => setItems((prev) => applyCollectionToSales(prev, collection)),
    paymentVoided: (collection) =>
      setItems((prev) => applyCollectionToSales(prev, collection, -1)),
  };
}
