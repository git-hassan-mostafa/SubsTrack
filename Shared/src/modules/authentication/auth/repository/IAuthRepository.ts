import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { DbTenant, DbUser } from "@shared/core/types/db";

export interface IAuthRepository {
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  getUserProfile(userId: string): Promise<DbUser | null>;
  getTenant(tenantId: string): Promise<DbTenant | null>;
  getTenantByCode(tenantCode: string): Promise<DbTenant | null>;
  onAuthStateChange(
    callback: Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0],
  ): ReturnType<SupabaseClient["auth"]["onAuthStateChange"]>;
}
