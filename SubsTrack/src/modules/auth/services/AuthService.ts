import type { AuthUser, Tenant } from "@/src/core/types";
import type { DbTenant, DbUser } from "@/src/core/types/db";
import { AuthRepository } from "../repository/AuthRepository";

export interface AuthResult {
  user: AuthUser;
  tenantActive: boolean;
}

function mapDbTenantToTenant(db: DbTenant): Tenant {
  return {
    id: db.id,
    name: db.name,
    tenantCode: db.tenant_code,
    active: db.active,
    createdAt: db.created_at,
  };
}

function mapDbUserToAuthUser(db: DbUser, tenant: DbTenant): AuthUser {
  return {
    id: db.id,
    username: db.username,
    fullName: db.full_name,
    role: db.role,
    active: db.active,
    tenantId: db.tenant_id,
    tenant: mapDbTenantToTenant(tenant),
  };
}

export class AuthService {
  private repository = new AuthRepository();

  async login(
    username: string,
    tenantCode: string,
    password: string,
  ): Promise<AuthResult> {
    if (!username.trim()) throw new Error("Username is required");
    if (!tenantCode.trim()) throw new Error("Tenant code is required");
    if (!password) throw new Error("Password is required");

    const email = `${username.trim().toLowerCase()}@${tenantCode.trim().toLowerCase()}.com`;

    let session;
    try {
      session = await this.repository.signIn(email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      console.log(msg);
      if (
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("credentials")
      ) {
        throw new Error("Invalid username or password");
      }
      throw new Error("Connection error. Please try again.");
    }

    const profile = await this.repository.getUserProfile(session.user.id);
    if (!profile) {
      await this.repository.signOut().catch(() => { });
      throw new Error("account_not_configured");
    }
    if (!profile.active) {
      await this.repository.signOut().catch(() => { });
      throw new Error("Your account has been deactivated. Contact your administrator.");
    }
    const tenant = await this.repository.getTenant(profile.tenant_id);
    if (!tenant) {
      await this.repository.signOut().catch(() => { });
      throw new Error("account_not_configured");
    }
    return {
      user: mapDbUserToAuthUser(profile, tenant),
      tenantActive: tenant.active,
    };
  }

  async restoreSession(): Promise<AuthResult | null> {
    const session = await this.repository.getSession();
    if (!session) return null;

    const profile = await this.repository.getUserProfile(session.user.id);
    if (!profile) {
      await this.repository.signOut().catch(() => { });
      return null;
    }
    if (!profile.active) {
      await this.repository.signOut().catch(() => { });
      return null;
    }

    const tenant = await this.repository.getTenant(profile.tenant_id);
    if (!tenant) {
      await this.repository.signOut().catch(() => { });
      return null;
    }
    return {
      user: mapDbUserToAuthUser(profile, tenant),
      tenantActive: tenant.active,
    };
  }

  async logout(): Promise<void> {
    await this.repository.signOut();
  }
}
