import type { TierPlan } from "@/src/core/types";
import type { DbTierPlan } from "@/src/core/types/db";
import { TierPlanRepository } from "../repository/TierPlanRepository";

export function mapDbTierPlanToTierPlan(db: DbTierPlan): TierPlan {
  return {
    id: db.id,
    code: db.code,
    name: db.name,
    sortOrder: db.sort_order,
    maxCustomers: db.max_customers,
    maxUsers: db.max_users,
    maxPlans: db.max_plans,
    maxBranches: db.max_branches,
    maxCurrencies: db.max_currencies,
    multiCurrencyEnabled: db.multi_currency_enabled,
    multiMonthPlansEnabled: db.multi_month_plans_enabled,
    graceDays: db.grace_days,
    priceMonthlyUsd: Number(db.price_monthly_usd),
    priceYearlyUsd: db.price_yearly_usd === null ? null : Number(db.price_yearly_usd),
    active: db.active,
  };
}

export interface TierPlanInput {
  name: string;
  maxCustomers: number | null;
  maxUsers: number | null;
  maxPlans: number | null;
  maxBranches: number | null;
  maxCurrencies: number | null;
  multiCurrencyEnabled: boolean;
  multiMonthPlansEnabled: boolean;
  graceDays: number;
  priceMonthlyUsd: number;
  priceYearlyUsd: number | null;
  active: boolean;
}

export class TierPlanService {
  private repository = new TierPlanRepository();

  async getTierPlans(): Promise<TierPlan[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbTierPlanToTierPlan);
  }

  async updateTierPlan(id: string, data: TierPlanInput): Promise<TierPlan> {
    this.validate(data);
    const row = await this.repository.update(id, {
      name: data.name.trim(),
      max_customers: data.maxCustomers,
      max_users: data.maxUsers,
      max_plans: data.maxPlans,
      max_branches: data.maxBranches,
      max_currencies: data.maxCurrencies,
      multi_currency_enabled: data.multiCurrencyEnabled,
      multi_month_plans_enabled: data.multiMonthPlansEnabled,
      grace_days: data.graceDays,
      price_monthly_usd: data.priceMonthlyUsd,
      price_yearly_usd: data.priceYearlyUsd,
      active: data.active,
    });
    return mapDbTierPlanToTierPlan(row);
  }

  private validate(data: TierPlanInput): void {
    if (!data.name.trim()) throw new Error("Tier name is required");
    if (data.graceDays < 0 || !Number.isInteger(data.graceDays)) {
      throw new Error("Grace days must be a non-negative integer");
    }
    if (data.priceMonthlyUsd < 0) {
      throw new Error("Monthly price must be non-negative");
    }
    const numericFields: (keyof TierPlanInput)[] = [
      "maxCustomers",
      "maxUsers",
      "maxPlans",
      "maxBranches",
      "maxCurrencies",
    ];
    for (const f of numericFields) {
      const v = data[f] as number | null;
      if (v !== null && (v < 0 || !Number.isInteger(v))) {
        throw new Error(`${f} must be a non-negative integer or unlimited`);
      }
    }
  }
}
