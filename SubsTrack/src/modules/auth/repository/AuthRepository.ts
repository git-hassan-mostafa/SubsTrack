import type { Session } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { supabase } from "@/src/shared/lib/supabase";
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

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      // Stale/invalid token (e.g. after a DB reset) — clear it and treat as no session
      await supabase.auth.signOut().catch(() => { });
      return null;
    }
    return data.session;
  }

  async getUserProfile(userId: string): Promise<DbUser | null> {
    const { data, error } = await supabase
      .from("users")
      // join the user's branch so the header can show "Beirut" without an extra round-trip
      .select("*, branches(*)")
      .eq("id", userId)
      .single();
    if (error) {
      // PGRST116 = no rows found — not a real error
      if (error.code === "PGRST116") return null;
      console.log("error ", error);
      throw new Error(error.message);
    }
    return data as DbUser;
  }

  async getTenant(tenantId: string): Promise<DbTenant | null> {
    const { data, error } = await supabase
      .from("tenants")
      .select("*, tier_plans(*)")
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
      .select("*, tier_plans(*)")
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

// Platform seam: web → Supabase directly (unchanged); native → offline cache.
const impl: IAuthRepository =
  Platform.OS === 'web' ? new AuthRepository() : new OfflineAuthRepository();

export default impl;
