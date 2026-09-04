import type { Collection, CollectionItem } from '@/src/core/types';
import { getBlockRangeLabel } from '@/src/modules/customer/customer-payments/utils/blockRangeLabel';

/** One other bill a hand-over settled, ready to print in a void warning. */
export interface SharedBill {
  chargeId: string;
  label: string;
  amount: number;
  snapshot: { currencyId: string | null; ratePerUsdSnapshot: number };
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * What a `collection_items` row paid for, from the row ALONE.
 *
 * `chargeLabel` needs the charge's own joins (`customer_plans.plans`, `sales`)
 * which a hydrated collection does not carry, so a month would print bare and a
 * sale would print nothing. This names the bill from the flat columns instead —
 * enough for a warning, and it costs no read.
 */
function billLabel(item: CollectionItem, t: Translate): string {
  const charge = item.charge;
  if (!charge) return t('ledger.shared_bill_fallback');
  if (charge.kind === 'month') {
    return charge.billingMonth
      ? getBlockRangeLabel(charge.billingMonth, charge.durationMonths, t)
      : t('ledger.shared_bill_fallback');
  }
  if (charge.kind === 'sale') return t('debts.sale');
  return charge.description?.trim() || t('debts.custom');
}

/**
 * The OTHER bills one hand-over settled — the collateral damage of voiding it.
 *
 * Voiding is always whole: a `collections` row is one physical handing-over of
 * cash and `collection_items` has no void of its own, so undoing October also
 * un-pays every bill that shared the note. Naming them is the only thing that
 * makes that predictable, and the split is already in memory.
 *
 * `exceptChargeId` is the bill the user is acting ON — it is the one outcome
 * they already expect, so listing it would bury the surprise.
 */
export function sharedBillsOf(
  collection: Pick<Collection, 'items' | 'currencyId' | 'ratePerUsdSnapshot'>,
  exceptChargeId: string | null,
  t: Translate,
): SharedBill[] {
  return (collection.items ?? [])
    .filter((item) => item.chargeId !== exceptChargeId)
    .map((item) => ({
      chargeId: item.chargeId,
      label: billLabel(item, t),
      amount: item.amount,
      snapshot: {
        currencyId: collection.currencyId,
        ratePerUsdSnapshot: collection.ratePerUsdSnapshot,
      },
    }));
}

/** The same across MANY hand-overs — a bill void undoes each one whole. */
export function sharedBillsAcross(
  collections: Pick<Collection, 'items' | 'currencyId' | 'ratePerUsdSnapshot'>[],
  exceptChargeId: string | null,
  t: Translate,
): SharedBill[] {
  const merged = new Map<string, SharedBill>();
  for (const collection of collections) {
    for (const bill of sharedBillsOf(collection, exceptChargeId, t)) {
      const key = `${bill.chargeId}|${bill.snapshot.currencyId ?? 'USD'}`;
      const seen = merged.get(key);
      if (seen) seen.amount += bill.amount;
      else merged.set(key, { ...bill });
    }
  }
  return [...merged.values()];
}
