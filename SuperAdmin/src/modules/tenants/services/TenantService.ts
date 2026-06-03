import type { Tenant, TierPlan } from "@/src/core/types";
import type { DbTenant, DbTierPlan } from "@/src/core/types/db";
import { supabaseAdmin } from "@/src/shared/lib/supabaseAdmin";
import { TenantRepository } from "../repository/TenantRepository";

function mapDbTierPlanToTierPlan(db: DbTierPlan): TierPlan {
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

function mapDbTenantToTenant(db: DbTenant): Tenant {
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

export interface CreateTenantInput {
  name: string;
  tenantCode: string;
  adminUserName: string;
  adminFullName: string;
  adminPassword: string;
  // Optional override for manual paid-tenant creation by the SaaS owner.
  // Defaults to Free when omitted.
  tierId?: string;
}

export interface UpdateTenantInput {
  name: string;
  active: boolean;
  // When provided, performs a manual upgrade/downgrade. tier_upgraded_at is
  // touched on every tier change so we can audit when the swap happened.
  tierId?: string;
}

export class TenantService {
  private repository = new TenantRepository();

  async getTenants(): Promise<Tenant[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbTenantToTenant);
  }

  async createTenant(data: CreateTenantInput): Promise<Tenant> {
    if (!data.name.trim()) throw new Error("Tenant name is required");
    if (!data.adminUserName.trim()) throw new Error("Admin username is required");
    if (!data.adminFullName.trim()) throw new Error("Admin full name is required");
    if (data.adminPassword.length < 8)
      throw new Error("Password must be at least 8 characters");

    const tierId = data.tierId ?? (await this.repository.getFreeTierId());

    const row = await this.repository.create({
      name: data.name.trim(),
      tenant_code: data.tenantCode.toLowerCase().trim(),
      tier_id: tierId,
    });
    const tenant = mapDbTenantToTenant(row);

    try {
      await this.repository.createDefaultBranch(tenant.id);
    } catch (e) {
      await this.repository.delete(tenant.id).catch(() => null);
      throw e;
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email:
          data.adminUserName.trim().toLowerCase() +
          "@" +
          tenant.tenantCode +
          ".com",
        password: data.adminPassword,
        email_confirm: true,
      });

    if (authError) {
      await this.repository.delete(tenant.id).catch(() => null);
      throw new Error(authError.message);
    }

    const { error: userError } = await supabaseAdmin.from("users").insert({
      id: authData.user.id,
      username: data.adminUserName.trim(),
      full_name: data.adminFullName.trim(),
      role: "superadmin",
      tenant_id: tenant.id,
    });

    if (userError) {
      await supabaseAdmin.auth.admin
        .deleteUser(authData.user.id)
        .catch(() => null);
      await this.repository.delete(tenant.id).catch(() => null);
      throw new Error(userError.message);
    }

    return tenant;
  }

  async updateTenant(id: string, data: UpdateTenantInput): Promise<Tenant> {
    if (!data.name.trim()) throw new Error("Tenant name is required");
    const payload: Partial<Pick<DbTenant, "name" | "active" | "tier_id" | "tier_upgraded_at">> = {
      name: data.name.trim(),
      active: data.active,
    };
    if (data.tierId) {
      payload.tier_id = data.tierId;
      payload.tier_upgraded_at = new Date().toISOString();
    }
    const row = await this.repository.update(id, payload);
    return mapDbTenantToTenant(row);
  }

  async deleteTenant(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
