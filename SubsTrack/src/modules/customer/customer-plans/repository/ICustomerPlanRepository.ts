import type { DbCustomerPlan } from '@/src/core/types/db';

export type CreateCustomerPlanPayload = Pick<
  DbCustomerPlan,
  'customer_id' | 'plan_id' | 'start_date' | 'tenant_id' | 'custom_price' | 'custom_currency_id'
>;

export interface ICustomerPlanRepository {
  create(payload: CreateCustomerPlanPayload): Promise<DbCustomerPlan>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomerPlan,
        | 'plan_id'
        | 'start_date'
        | 'active'
        | 'cancelled_at'
        | 'custom_price'
        | 'custom_currency_id'
      >
    >,
  ): Promise<DbCustomerPlan>;
  cancel(id: string): Promise<DbCustomerPlan>;
  delete(id: string): Promise<void>;
  // Counts EVERY payment row, voided ones included — a line whose payments were
  // voided still has history that a hard delete would take with it.
  countPayments(id: string): Promise<number>;
  // The customer's line ids that hold real, still-standing money (non-voided,
  // amount_paid > 0) — one query for the whole form. A line in here has its start
  // date locked: moving it would invent or hide months a payment already covers.
  findPaidLineIds(customerId: string): Promise<string[]>;
}
