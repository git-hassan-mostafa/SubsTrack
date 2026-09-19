import type { CustomerRequest, Tenant, TenantCounts } from "@/src/core/types";
import type { DbCustomerRequest, DbTenant } from "@/src/core/types/db";
import { supabaseAdmin } from "@/src/shared/lib/supabaseAdmin";
import {
  TenantRepository,
  type CountedTable,
  type CreateTenantPayload,
  type GrantedCounts,
  type TableCount,
} from "../repository/TenantRepository";

// Fallback USD→LBP rate (LBP per 1 USD) used only when the global
// app_options.LiraRate row is missing or invalid. A misconfigured option
// must never block tenant creation.
const DEFAULT_LIRA_RATE = 89000;

function mapDbCustomerRequest(db: DbCustomerRequest): CustomerRequest {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    requestedCount: db.requested_count,
    grantedCount: db.granted_count,
    requestedPlans: db.requested_plans ?? 0,
    grantedPlans: db.granted_plans,
    status: db.status,
    decidedAt: db.decided_at,
    createdAt: db.created_at,
  };
}

function mapDbTenantToTenant(
  db: DbTenant,
  pendingRequest: CustomerRequest | null = null,
): Tenant {
  return {
    id: db.id,
    name: db.name,
    tenantCode: db.tenant_code,
    active: db.active,
    customerAllowance: Number(db.customer_allowance),
    planAllowance: Number(db.plan_allowance),
    pricePerPlanUsd: Number(db.price_per_plan_usd),
    pendingRequest,
    createdAt: db.created_at,
  };
}

// Table names stop here — the sheet reads the domain names.
function mapTableCounts(rows: Record<CountedTable, TableCount>): TenantCounts {
  return {
    users: rows.users,
    branches: rows.branches,
    customers: rows.customers,
    serviceLines: rows.customer_plans,
    plans: rows.plans,
    products: rows.products,
    services: rows.services,
    currencies: rows.currencies,
  };
}

export interface CreateTenantInput {
  name: string;
  tenantCode: string;
  adminUserName: string;
  adminFullName: string;
  adminPassword: string;
  // Omitted values fall back to the tenants column defaults.
  customerAllowance?: number;
  planAllowance?: number;
  pricePerPlanUsd?: number;
}

export interface UpdateTenantInput {
  name: string;
  active: boolean;
  customerAllowance: number;
  planAllowance: number;
  pricePerPlanUsd: number;
}

// The allowance every tenant starts on and none may go below. Mirrored by
// chk_tenants_customer_allowance_min and by the tenant app's own constant.
export const MIN_CUSTOMER_ALLOWANCE = 30;

// The service-line allowance is what the tenant is billed on, and it can never
// sit below the customer one — mirrored by chk_tenants_plan_allowance_floor.
function validateBilling(
  allowance: number,
  planAllowance: number,
  price: number,
): void {
  if (!Number.isInteger(allowance) || allowance < MIN_CUSTOMER_ALLOWANCE)
    throw new Error(
      `Customer allowance must be a whole number of ${MIN_CUSTOMER_ALLOWANCE} or more`,
    );
  if (!Number.isInteger(planAllowance) || planAllowance < allowance)
    throw new Error(
      "Service line allowance must be a whole number and at least the customer allowance",
    );
  if (!Number.isFinite(price) || price < 0)
    throw new Error("Price per service line must be 0 or more");
}

export class TenantService {
  private repository = new TenantRepository();

  async getTenants(): Promise<Tenant[]> {
    const [rows, requests] = await Promise.all([
      this.repository.findAll(),
      this.repository.findPendingRequests(),
    ]);
    const byTenant = new Map<string, CustomerRequest>();
    for (const r of requests)
      byTenant.set(r.tenant_id, mapDbCustomerRequest(r));
    return rows.map((row) =>
      mapDbTenantToTenant(row, byTenant.get(row.id) ?? null),
    );
  }

  async getTenantCounts(tenantId: string): Promise<TenantCounts> {
    return mapTableCounts(await this.repository.countRows(tenantId));
  }

  async createTenant(data: CreateTenantInput): Promise<Tenant> {
    if (!data.name.trim()) throw new Error("Tenant name is required");
    if (!data.adminUserName.trim())
      throw new Error("Admin username is required");
    if (!data.adminFullName.trim())
      throw new Error("Admin full name is required");
    if (data.adminPassword.length < 8)
      throw new Error("Password must be at least 8 characters");
    // Only what was actually typed is checked; an omitted field takes the
    // schema default, which already sits on the floor.
    validateBilling(
      data.customerAllowance ?? MIN_CUSTOMER_ALLOWANCE,
      data.planAllowance ?? MIN_CUSTOMER_ALLOWANCE,
      data.pricePerPlanUsd ?? 0,
    );

    const payload: CreateTenantPayload = {
      name: data.name.trim(),
      tenant_code: data.tenantCode.toLowerCase().trim(),
    };
    if (data.customerAllowance !== undefined)
      payload.customer_allowance = data.customerAllowance;
    if (data.planAllowance !== undefined)
      payload.plan_allowance = data.planAllowance;
    if (data.pricePerPlanUsd !== undefined)
      payload.price_per_plan_usd = data.pricePerPlanUsd;

    const row = await this.repository.create(payload);
    const tenant = mapDbTenantToTenant(row);

    try {
      await this.repository.createDefaultBranch(tenant.id);
      // Seed the tenant's default Lebanese Pound (LBP) currency from the
      // global LiraRate option. currencies → tenants FK cascades on delete,
      // so the rollback below cleans this up alongside the branch.
      const liraRate =
        (await this.repository.getLiraRate()) ?? DEFAULT_LIRA_RATE;
      await this.repository.createLbpCurrency(tenant.id, liraRate);
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
    validateBilling(
      data.customerAllowance,
      data.planAllowance,
      data.pricePerPlanUsd,
    );
    const row = await this.repository.update(id, {
      name: data.name.trim(),
      active: data.active,
      customer_allowance: data.customerAllowance,
      plan_allowance: data.planAllowance,
      price_per_plan_usd: data.pricePerPlanUsd,
    });
    return mapDbTenantToTenant(row);
  }

  // Returns the new limits so the caller can patch the row it already holds.
  // The line limit follows the customer one up, exactly as the RPC does.
  async acceptRequest(
    requestId: string,
    granted: GrantedCounts,
    current: { customers: number; plans: number },
  ): Promise<{ request: CustomerRequest; customers: number; plans: number }> {
    const whole =
      Number.isInteger(granted.customers) &&
      Number.isInteger(granted.plans) &&
      granted.customers >= 0 &&
      granted.plans >= 0;
    if (!whole || granted.customers + granted.plans < 1)
      throw new Error("Grant a whole number of 1 or more in total");
    const row = await this.repository.acceptRequest(requestId, granted);
    const customers = current.customers + granted.customers;
    return {
      request: mapDbCustomerRequest(row),
      customers,
      plans: Math.max(current.plans + granted.plans, customers),
    };
  }

  async declineRequest(requestId: string): Promise<CustomerRequest> {
    const row = await this.repository.declineRequest(requestId);
    return mapDbCustomerRequest(row);
  }

  async deleteTenant(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
