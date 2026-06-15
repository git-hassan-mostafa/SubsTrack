import { Tenant, TierPlan } from "@/src/core/types";
import { DbTenant, DbTierPlan } from "@/src/core/types/db";

export function mapDbTenantToTenant(db: DbTenant): Tenant {
    return {
        id: db.id,
        name: db.name,
        tenantCode: db.tenant_code,
        active: db.active,
        tierId: db.tier_id,
        tier: db.tier_plans ? mapDbTierPlanToTierPlan(db.tier_plans) : null,
        tierUpgradedAt: db.tier_upgraded_at,
        createdAt: db.created_at,
    };
}

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
        maxProducts: db.max_products,
        multiCurrencyEnabled: db.multi_currency_enabled,
        multiMonthPlansEnabled: db.multi_month_plans_enabled,
        graceDays: db.grace_days,
        priceMonthlyUsd: Number(db.price_monthly_usd),
        priceYearlyUsd: db.price_yearly_usd === null ? null : Number(db.price_yearly_usd),
        active: db.active,
    };
}
