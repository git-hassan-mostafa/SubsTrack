import type { BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbPlan } from "@shared/core/types/db";
import type { PlanPageQuery } from "@shared/modules/admin/plans/utils/types";

// Both the Supabase and the offline SQLite class implement this contract.
export interface IPlanRepository {
  findAll(branchFilter?: BranchFilter): Promise<DbPlan[]>;
  findPage(query: PlanPageQuery): Promise<Page<DbPlan>>;
  create(payload: Omit<DbPlan, "id" | "created_at">): Promise<DbPlan>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbPlan,
        | "name"
        | "price"
        | "is_custom_price"
        | "duration_months"
        | "currency_id"
        | "branch_id"
      >
    >,
  ): Promise<DbPlan>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
}
