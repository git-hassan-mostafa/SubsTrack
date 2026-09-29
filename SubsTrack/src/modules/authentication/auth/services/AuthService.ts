import { repositories } from "@shared/core/runtime/repositories";
import i18n from "@shared/core/i18n";
import { mapDbUserToAuthUser } from "@shared/modules/authentication/auth/utils/mapper";
import { AuthUser } from "@shared/core/types";
import type { DbUser } from "@shared/core/types/db";
import { OrganizationSwitchBlockedError } from "@shared/core/errors/offlineErrors";

interface AuthResult {
  user: AuthUser;
  tenantActive: boolean;
}

class AuthService {
  async login(
    username: string,
    tenantCode: string,
    password: string,
  ): Promise<AuthResult> {
    if (!username.trim()) throw new Error(i18n.t("errors.username_required"));
    if (!tenantCode.trim())
      throw new Error(i18n.t("errors.tenant_code_required"));
    if (!password) throw new Error(i18n.t("errors.password_required"));

    const email = `${username.trim().toLowerCase()}@${tenantCode.trim().toLowerCase()}.com`;

    let session;
    try {
      session = await repositories().auth.signIn(email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      console.log(msg);
      if (
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("credentials")
      ) {
        throw new Error(i18n.t("errors.invalid_credentials"));
      }
      throw new Error(i18n.t("errors.connection_error"));
    }

    let profile: DbUser | null;
    try {
      profile = await repositories().auth.getUserProfile(session.user.id);
    } catch (e) {
      if (e instanceof OrganizationSwitchBlockedError) {
        await repositories().auth.signOut().catch(() => {});
      }
      throw e;
    }
    if (!profile) {
      await repositories().auth.signOut().catch(() => {});
      throw new Error("account_not_configured");
    }
    if (!profile.active) {
      await repositories().auth.signOut().catch(() => {});
      throw new Error(i18n.t("errors.account_deactivated"));
    }
    const tenant = await repositories().auth.getTenant(profile.tenant_id);
    if (!tenant) {
      await repositories().auth.signOut().catch(() => {});
      throw new Error("account_not_configured");
    }
    return {
      user: mapDbUserToAuthUser(profile, tenant),
      tenantActive: tenant.active,
    };
  }

  async restoreSession(): Promise<AuthResult | null> {
    const session = await repositories().auth.getSession();
    if (!session) return null;

    let profile: DbUser | null;
    try {
      profile = await repositories().auth.getUserProfile(session.user.id);
    } catch (e) {
      if (e instanceof OrganizationSwitchBlockedError) {
        await repositories().auth.signOut().catch(() => {});
        return null;
      }
      throw e;
    }
    if (!profile) {
      await repositories().auth.signOut().catch(() => {});
      return null;
    }
    if (!profile.active) {
      await repositories().auth.signOut().catch(() => {});
      return null;
    }

    const tenant = await repositories().auth.getTenant(profile.tenant_id);
    if (!tenant) {
      await repositories().auth.signOut().catch(() => {});
      return null;
    }
    return {
      user: mapDbUserToAuthUser(profile, tenant),
      tenantActive: tenant.active,
    };
  }

  async logout(): Promise<void> {
    await repositories().auth.signOut();
  }
}

export default new AuthService();
