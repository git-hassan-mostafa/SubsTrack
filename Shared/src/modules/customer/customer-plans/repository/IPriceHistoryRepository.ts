import type { DbLinePriceChange, DbPlanPriceChange } from "@shared/core/types/db";

export type PlanPriceChangePayload = Omit<DbPlanPriceChange, "updated_at">;
export type LinePriceChangePayload = Omit<DbLinePriceChange, "updated_at">;

// Both the Supabase and the offline SQLite class implement this contract.
export interface IPriceHistoryRepository {
  findPlanChanges(planIds: string[]): Promise<DbPlanPriceChange[]>;
  findLineChanges(customerPlanIds: string[]): Promise<DbLinePriceChange[]>;
  // `first` is written only when absent; `change` is always appended.
  addPlanChange(
    first: PlanPriceChangePayload,
    change: PlanPriceChangePayload,
  ): Promise<void>;
  addLineChange(
    first: LinePriceChangePayload,
    change: LinePriceChangePayload,
  ): Promise<void>;
}
