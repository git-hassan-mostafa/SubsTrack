import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { DbBranch, DbTenant, DbUser } from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { upsertFromServer } from "@/src/core/offline/db/dml";
import { isOnline } from "@/src/core/offline/net/connectivity";
import {
  RequiresConnectionError,
  OrganizationSwitchBlockedError,
} from "@shared/core/errors/offlineErrors";
import {
  ensureTenantScope,
  hasUnsyncedWrites,
  holdsTenantScope,
} from "@/src/core/offline/bootstrap/tenant";
import {
  runSync,
  runSyncIfDue,
  flushPendingWrites,
} from "@/src/core/offline/sync";
import type { IAuthRepository } from "@shared/modules/authentication/auth/repository/IAuthRepository";
import { AuthRepository } from "@shared/modules/authentication/auth/repository/AuthRepository";
import { readSavedSession } from "@shared/modules/authentication/auth/repository/savedSession";

/** Read-through cache over the online repo — see docs/offline.md, #154/#159. */
export class OfflineAuthRepository
  extends OfflineBaseRepository
  implements IAuthRepository
{
  private online = new AuthRepository();

  async signIn(email: string, password: string): Promise<Session> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.signIn(email, password);
  }

  async signOut(): Promise<void> {
    try {
      if (await hasUnsyncedWrites(this.db)) await flushPendingWrites();
    } catch {}
    return this.online.signOut();
  }

  // Offline skips supabase-js's ~25 s refresh retries on an expired token (#192)
  async getSession(): Promise<Session | null> {
    if (await isOnline()) return this.online.getSession();
    return readSavedSession();
  }

  // customers counted AFTER scoping: a tenant switch just wiped → full pull
  async getUserProfile(userId: string): Promise<DbUser | null> {
    if (!(await isOnline())) return this.readCachedProfile(userId);
    let profile: DbUser | null;
    try {
      profile = await this.online.getUserProfile(userId);
    } catch (e) {
      return this.cachedOrThrow(e, this.readScopedProfile(userId));
    }
    if (!profile || !profile.active) return profile;
    const scope = await ensureTenantScope(
      profile.tenant_id,
      profile.branch_id,
      profile.role,
    );
    if (scope.blockedByPending) throw new OrganizationSwitchBlockedError();
    const wasEmpty =
      (await this.count("SELECT COUNT(*) AS n FROM customers")) === 0;
    await upsertFromServer(this.db, "users", profile);
    const branch = (profile as { branches?: DbBranch | null }).branches;
    if (branch) await upsertFromServer(this.db, "branches", branch);
    if (wasEmpty) await runSync();
    else void runSyncIfDue();
    return profile;
  }

  async getTenant(tenantId: string): Promise<DbTenant | null> {
    if (!(await isOnline())) return this.readCachedTenant(tenantId);
    let tenant: DbTenant | null;
    try {
      tenant = await this.online.getTenant(tenantId);
    } catch (e) {
      return this.cachedOrThrow(e, this.readCachedTenant(tenantId));
    }
    if (tenant) await this.cacheTenant(tenant);
    return tenant;
  }

  async getTenantByCode(tenantCode: string): Promise<DbTenant | null> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.getTenantByCode(tenantCode);
  }

  onAuthStateChange(
    callback: Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0],
  ) {
    return this.online.onAuthStateChange(callback);
  }

  // A failed online read on a weak network serves the cache, never a logout (#192)
  private async cachedOrThrow<T>(
    error: unknown,
    cached: Promise<T | null>,
  ): Promise<T> {
    const row = await cached;
    if (row) return row;
    throw error;
  }

  // Another login's cached row must not open a mirror scoped for someone else
  private async readScopedProfile(userId: string): Promise<DbUser | null> {
    const user = await this.readCachedProfile(userId);
    if (!user) return null;
    const scoped = await holdsTenantScope(
      user.tenant_id,
      user.branch_id,
      user.role,
    );
    return scoped ? user : null;
  }

  private async readCachedProfile(userId: string): Promise<DbUser | null> {
    const row = await this.first("SELECT * FROM users WHERE id = ?", [userId]);
    if (!row) return null;
    const user = this.decodeOne<DbUser>("users", row)!;
    if (user.branch_id) {
      const branches = await this.rowsById<DbBranch>("branches", [
        user.branch_id,
      ]);
      (user as { branches?: DbBranch | null }).branches =
        branches.get(user.branch_id) ?? null;
    }
    return user;
  }

  private async cacheTenant(tenant: DbTenant): Promise<void> {
    await upsertFromServer(this.db, "tenants", tenant);
  }

  private async readCachedTenant(tenantId: string): Promise<DbTenant | null> {
    const row = await this.first("SELECT * FROM tenants WHERE id = ?", [
      tenantId,
    ]);
    if (!row) return null;
    return this.decodeOne<DbTenant>("tenants", row);
  }
}
