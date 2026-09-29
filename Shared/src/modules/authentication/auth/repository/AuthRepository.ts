import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { BaseRepository } from "@shared/core/utils/BaseRepository";
import { runtime } from "@shared/core/runtime/runtime";
import type { DbTenant, DbUser } from "@shared/core/types/db";
import type { IAuthRepository } from "@shared/modules/authentication/auth/repository/IAuthRepository";

export class AuthRepository
  extends BaseRepository
  implements IAuthRepository
{
  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await this.db.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error("No session returned");
    return data.session;
  }

  /** Local scope + hand-clear fallback: an offline logout must stick (#158). */
  async signOut(): Promise<void> {
    const { error } = await this.db.auth.signOut({ scope: "local" });
    if (!error) return;
    console.warn(
      "[auth] remote sign-out failed, clearing locally:",
      error.message,
    );
    const { storage, authStorageKey } = runtime();
    await storage.removeItem(authStorageKey);
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.db.auth.getSession();
    if (error) {
      await this.signOut().catch(() => {});
      return null;
    }
    return data.session;
  }

  async getUserProfile(userId: string): Promise<DbUser | null> {
    const { data, error } = await this.db
      .from("users")
      .select("*, branches(*)")
      .eq("id", userId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      console.log("error ", error);
      throw new Error(error.message);
    }
    return data as DbUser;
  }

  async getTenant(tenantId: string): Promise<DbTenant | null> {
    const { data, error } = await this.db
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(error.message);
    }
    return data as DbTenant;
  }

  async getTenantByCode(tenantCode: string): Promise<DbTenant | null> {
    const { data, error } = await this.db
      .from("tenants")
      .select("*")
      .eq("tenant_code", tenantCode.trim().toLowerCase())
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(error.message);
    }
    return data as DbTenant;
  }

  onAuthStateChange(
    callback: Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0],
  ) {
    return this.db.auth.onAuthStateChange(callback);
  }
}

