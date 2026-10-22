import type { DbCustomerPlan } from "@shared/core/types/db";

export type CreateCustomerPlanPayload = Pick<
  DbCustomerPlan,
  | "customer_id"
  | "plan_id"
  | "start_date"
  | "tenant_id"
  | "custom_price"
  | "custom_currency_id"
  | "meter_number"
  | "start_reading"
  | "prepaid"
>;

export type UpdateCustomerPlanPayload = Partial<
  Pick<
    DbCustomerPlan,
    | "plan_id"
    | "start_date"
    | "active"
    | "cancelled_at"
    | "custom_price"
    | "custom_currency_id"
    | "meter_number"
    | "start_reading"
    | "prepaid"
  >
>;

export interface ICustomerPlanRepository {
  create(payload: CreateCustomerPlanPayload): Promise<DbCustomerPlan>;
  update(id: string, payload: UpdateCustomerPlanPayload): Promise<DbCustomerPlan>;
  cancel(id: string, cancelledAt: string): Promise<DbCustomerPlan>;
  delete(id: string): Promise<void>;
  countActive(): Promise<number>;
  countPayments(id: string): Promise<number>;
  findPaidLineIds(customerId: string): Promise<string[]>;
}
