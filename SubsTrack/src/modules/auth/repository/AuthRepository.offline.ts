import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/src/shared/lib/supabase';
import type { DbBranch, DbTenant, DbTierPlan, DbUser } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { upsertFromServer } from '@/src/core/offline/db/dml';
import { isOnline } from '@/src/core/offline/net/connectivity';
import { RequiresConnectionError } from '@/src/core/offline/errors';
import { ensureTenantScope } from '@/src/core/offline/bootstrap/tenant';
import { runSync } from '@/src/core/offline/sync';
import type { IAuthRepository } from './IAuthRepository';
import { AuthRepository } from './AuthRepository';

/**
 * Read-through cache over the online AuthRepository. Auth itself is online-only
 * (signIn / getTenantByCode). getSession/getUserProfile/getTenant serve the
 * cache when offline so the app boots offline. On the first online login they
 * cache the profile + tenant and block on an initial full pull so downstream
 * offline reads (currencies, branches, customers…) find data.
 */
export class OfflineAuthRepository extends OfflineBaseRepository implements IAuthRepository {
  private online = new AuthRepository();

  async signIn(email: string, password: string): Promise<Session> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.signIn(email, password);
  }

  async signOut(): Promise<void> {
    return this.online.signOut();
  }

  async getSession(): Promise<Session | null> {
    // Reads the Supabase-persisted session from storage — works offline.
    return this.online.getSession();
  }

  async getUserProfile(userId: string): Promise<DbUser | null> {
    if (await isOnline()) {
      const profile = await this.online.getUserProfile(userId);
      if (!profile) return profile;
      // Scope the local DB to this tenant (wipe on a different-tenant login),
      // BEFORE caching the fresh profile.
      const wasEmpty = (await this.count('SELECT COUNT(*) AS n FROM customers')) === 0;
      await ensureTenantScope(profile.tenant_id);
      await upsertFromServer(this.db, 'users', profile);
      const branch = (profile as { branches?: DbBranch | null }).branches;
      if (branch) await upsertFromServer(this.db, 'branches', branch);
      // First login on this device → block on the initial pull; otherwise refresh in background.
      if (wasEmpty) await runSync();
      else void runSync();
      return profile;
    }
    // Offline: serve the cached profile + hydrate its branch.
    const row = await this.first('SELECT * FROM users WHERE id = ?', [userId]);
    if (!row) return null;
    const user = this.decodeOne<DbUser>('users', row)!;
    if (user.branch_id) {
      const branches = await this.rowsById<DbBranch>('branches', [user.branch_id]);
      (user as { branches?: DbBranch | null }).branches = branches.get(user.branch_id) ?? null;
    }
    return user;
  }

  async getTenant(tenantId: string): Promise<DbTenant | null> {
    if (await isOnline()) {
      const tenant = await this.online.getTenant(tenantId);
      if (tenant) await this.cacheTenant(tenant);
      return tenant;
    }
    return this.readCachedTenant(tenantId);
  }

  async getTenantByCode(tenantCode: string): Promise<DbTenant | null> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.getTenantByCode(tenantCode);
  }

  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return this.online.onAuthStateChange(callback);
  }

  private async cacheTenant(tenant: DbTenant): Promise<void> {
    await upsertFromServer(this.db, 'tenants', tenant);
    const tier = (tenant as { tier_plans?: DbTierPlan | null }).tier_plans;
    if (tier) await upsertFromServer(this.db, 'tier_plans', tier);
  }

  private async readCachedTenant(tenantId: string): Promise<DbTenant | null> {
    const row = await this.first('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!row) return null;
    const tenant = this.decodeOne<DbTenant>('tenants', row)!;
    if (tenant.tier_id) {
      const tiers = await this.rowsById<DbTierPlan>('tier_plans', [tenant.tier_id]);
      tenant.tier_plans = tiers.get(tenant.tier_id) ?? null;
    }
    return tenant;
  }
}
