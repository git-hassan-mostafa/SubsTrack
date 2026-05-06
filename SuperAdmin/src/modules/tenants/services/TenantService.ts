import type { Tenant } from "@/src/core/types";
import type { DbTenant } from "@/src/core/types/db";
import { supabaseAdmin } from "@/src/shared/lib/supabaseAdmin";
import { TenantRepository } from "../repository/TenantRepository";

function mapDbTenantToTenant(db: DbTenant): Tenant {
  return {
    id: db.id,
    name: db.name,
    tenantCode: db.tenant_code,
    active: db.active,
    createdAt: db.created_at,
  };
}

export interface CreateTenantInput {
  name: string;
  tenantCode: string;
  adminUserName: string;
  adminPassword: string;
}

export interface UpdateTenantInput {
  name: string;
  active: boolean;
}

export class TenantService {
  private repository = new TenantRepository();

  async getTenants(): Promise<Tenant[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbTenantToTenant);
  }

  async createTenant(data: CreateTenantInput): Promise<Tenant> {
    if (!data.name.trim()) throw new Error("Tenant name is required");
    if (!data.adminUserName.trim()) throw new Error("Admin email is required");
    if (data.adminPassword.length < 8)
      throw new Error("Password must be at least 8 characters");

    const row = await this.repository.create({
      name: data.name.trim(),
      tenant_code: data.tenantCode.toLowerCase().trim(),
    });
    const tenant = mapDbTenantToTenant(row);

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
      role: "admin",
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
    const row = await this.repository.update(id, {
      name: data.name.trim(),
      active: data.active,
    });
    return mapDbTenantToTenant(row);
  }

  async deleteTenant(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
