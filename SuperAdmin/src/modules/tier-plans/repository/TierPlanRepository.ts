import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbTierPlan } from "@/src/core/types/db";

export class TierPlanRepository extends BaseRepository {
  async findAll(): Promise<DbTierPlan[]> {
    const { data, error } = await this.db
      .from("tier_plans")
      .select("*")
      .order("sort_order");
    if (error) this.handleError(error);
    return (data ?? []) as DbTierPlan[];
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbTierPlan,
        | "name"
        | "max_customers"
        | "max_users"
        | "max_plans"
        | "max_branches"
        | "max_currencies"
        | "multi_currency_enabled"
        | "multi_month_plans_enabled"
        | "grace_days"
        | "price_monthly_usd"
        | "price_yearly_usd"
        | "active"
      >
    >,
  ): Promise<DbTierPlan> {
    const { data, error } = await this.db
      .from("tier_plans")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbTierPlan;
  }
}
