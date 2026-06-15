import i18n from "@/src/core/i18n";
import repository from "../repository/AuthRepository";
import { mapDbUserToAuthUser } from "../utils/mapper";
import { AuthUser } from "@/src/core/types";

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
    if (!tenantCode.trim()) throw new Error(i18n.t("errors.tenant_code_required"));
    if (!password) throw new Error(i18n.t("errors.password_required"));

    const email = `${username.trim().toLowerCase()}@${tenantCode.trim().toLowerCase()}.com`;

    let session;
    try {
      session = await repository.signIn(email, password);
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

    const profile = await repository.getUserProfile(session.user.id);
    if (!profile) {
      await repository.signOut().catch(() => { });
      throw new Error("account_not_configured");
    }
    if (!profile.active) {
      await repository.signOut().catch(() => { });
      throw new Error(i18n.t("errors.account_deactivated"));
    }
    const tenant = await repository.getTenant(profile.tenant_id);
    if (!tenant) {
      await repository.signOut().catch(() => { });
      throw new Error("account_not_configured");
    }
    return {
      user: mapDbUserToAuthUser(profile, tenant),
      tenantActive: tenant.active,
    };
  }

  async restoreSession(): Promise<AuthResult | null> {
    const session = await repository.getSession();
    if (!session) return null;

    const profile = await repository.getUserProfile(session.user.id);
    if (!profile) {
      await repository.signOut().catch(() => { });
      return null;
    }
    if (!profile.active) {
      await repository.signOut().catch(() => { });
      return null;
    }

    const tenant = await repository.getTenant(profile.tenant_id);
    if (!tenant) {
      await repository.signOut().catch(() => { });
      return null;
    }
    return {
      user: mapDbUserToAuthUser(profile, tenant),
      tenantActive: tenant.active,
    };
  }

  async logout(): Promise<void> {
    await repository.signOut();
  }
}

export default new AuthService()