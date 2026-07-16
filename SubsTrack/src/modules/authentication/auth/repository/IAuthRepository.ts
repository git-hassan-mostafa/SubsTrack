import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/src/shared/lib/supabase';
import type { DbTenant, DbUser } from '@/src/core/types/db';

export interface IAuthRepository {
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  getUserProfile(userId: string): Promise<DbUser | null>;
  getTenant(tenantId: string): Promise<DbTenant | null>;
  getTenantByCode(tenantCode: string): Promise<DbTenant | null>;
  onAuthStateChange(
    callback: Parameters<typeof supabase.auth.onAuthStateChange>[0],
  ): ReturnType<typeof supabase.auth.onAuthStateChange>;
}
