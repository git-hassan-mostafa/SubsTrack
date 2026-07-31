import type { DbSkippedMonth } from '@/src/core/types/db';

// One skip state to write. `skipped: false` removes the skip — the row stays so
// the change reaches other devices (see script.sql → SKIPPED MONTHS).
export type SkippedMonthPayload = Pick<
  DbSkippedMonth,
  | 'tenant_id'
  | 'customer_id'
  | 'customer_plan_id'
  | 'billing_month'
  | 'skipped'
  | 'note'
  | 'skipped_by_user_id'
>;

export interface ISkippedMonthRepository {
  // Active skips on every service line of one customer (all years) — the month
  // grid rebuilds any year from this list, like it does with payments.
  findActiveByCustomer(customerId: string): Promise<DbSkippedMonth[]>;
  // Every active skip in the tenant — the customer-list overdue scan needs them
  // for all customers at once (mirrors findActivePayments).
  findActive(): Promise<DbSkippedMonth[]>;
  // Upsert on the natural key (customer_plan_id, billing_month): skip, unskip,
  // and edit-the-note are all the same write.
  upsertMany(payloads: SkippedMonthPayload[]): Promise<DbSkippedMonth[]>;
}
