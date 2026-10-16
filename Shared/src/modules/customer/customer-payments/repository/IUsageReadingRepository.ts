import type { DbUsageReading } from "@shared/core/types/db";

export type UsageReadingPayload = Pick<
  DbUsageReading,
  | "tenant_id"
  | "customer_id"
  | "customer_plan_id"
  | "billing_month"
  | "reading"
  | "units"
  | "old_meter_final"
  | "new_meter_start"
  | "new_meter_number"
  | "recorded_by_user_id"
  | "recorded_at"
>;

// Both the Supabase and the offline SQLite class implement this contract.
export interface IUsageReadingRepository {
  findForLines(customerPlanIds: string[]): Promise<DbUsageReading[]>;
  // Upsert on (customer_plan_id, billing_month); saving over a removed reading revives it.
  save(payload: UsageReadingPayload): Promise<DbUsageReading>;
  remove(id: string, voidedBy: string): Promise<DbUsageReading>;
}
