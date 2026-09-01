import type { DbCharge } from '@/src/core/types/db';
import type { CreateChargePayload } from './IChargeRepository';

/**
 * A bill that is no longer owed — and therefore invisible to the grid, the
 * debts screen and every balance read.
 *
 * It still OWNS its `(customer_plan_id, billing_month)` unique key, so it is the
 * only row that month can ever have. Cash aimed at that month lands on it, and
 * unless it is revived first the money is saved and then vanishes from every
 * screen (gotcha #115).
 */
export function isDeadBill(row: DbCharge): boolean {
  return !!row.voided_at || !!row.written_off_at;
}

/**
 * Cash contradicts both statements a dead bill makes — a void ("it was a
 * mistake, it never existed") and a write-off ("it is real but will never be
 * paid"). So money arriving clears BOTH, always.
 *
 * `issued_at` is re-stamped with them: the row survived only because it owns the
 * month's unique key, so keeping the dead bill's raise date reports a revived
 * month as billed on a day nothing was billed (the sheet's "Billed on"). The
 * bill being raised again IS a new raise — the same reasoning as re-pricing an
 * empty bill (#106b). `due_date` is untouched: ageing belongs to the month.
 */
export function revivePatch(issuedAt: string) {
  return {
    voided_at: null,
    voided_by: null,
    void_reason: null,
    written_off_at: null,
    written_off_by: null,
    write_off_reason: null,
    issued_at: issuedAt,
  } as const;
}

/** Nothing about the price moved, so an empty bill needs no re-pricing. */
export function samePrice(row: DbCharge, next: CreateChargePayload): boolean {
  return (
    Number(row.amount) === Number(next.amount) &&
    row.currency_id === next.currency_id &&
    Number(row.rate_per_usd_snapshot) === Number(next.rate_per_usd_snapshot) &&
    row.duration_months === next.duration_months &&
    row.plan_id === next.plan_id
  );
}
