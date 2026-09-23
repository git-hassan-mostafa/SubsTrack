import type { Session } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { AUTH_STORAGE_KEY, supabase } from "@/src/shared/lib/supabase";
import { supabaseStorage } from "@/src/shared/lib/storage";
import type { DbTenant, DbUser } from "@/src/core/types/db";
import type { IAuthRepository } from "./IAuthRepository";
import { OfflineAuthRepository } from "./AuthRepository.offline";

export class AuthRepository implements IAuthRepository {
  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error("No session returned");
    return data.session;
  }

  /** Local scope + hand-clear fallback: an offline logout must stick (#158). */
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (!error) return;
    console.warn(
      "[auth] remote sign-out failed, clearing locally:",
      error.message,
    );
    await supabaseStorage.removeItem(AUTH_STORAGE_KEY);
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      await this.signOut().catch(() => {});
      return null;
    }
    return data.session;
  }

  async getUserProfile(userId: string): Promise<DbUser | null> {
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    callback: Parameters<typeof supabase.auth.onAuthStateChange>[0],
  ) {
    return supabase.auth.onAuthStateChange(callback);
  }
}

const impl: IAuthRepository =
  Platform.OS === "web" ? new AuthRepository() : new OfflineAuthRepository();

export default impl;
