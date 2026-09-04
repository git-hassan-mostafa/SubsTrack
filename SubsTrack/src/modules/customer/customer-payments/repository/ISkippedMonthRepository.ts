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
  findActiveByCustomer(customerId: string): Promise<DbSkippedMonth[]>;
  findActive(): Promise<DbSkippedMonth[]>;
  upsertMany(payloads: SkippedMonthPayload[]): Promise<DbSkippedMonth[]>;
}
