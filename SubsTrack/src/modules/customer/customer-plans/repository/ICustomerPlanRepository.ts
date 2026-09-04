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
  countPayments(id: string): Promise<number>;
  findPaidLineIds(customerId: string): Promise<string[]>;
}
