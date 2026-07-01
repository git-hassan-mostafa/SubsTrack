import type { DbTenant, DbTierPlan } from '@/src/core/types/db';
import type { TenantUsage } from '@/src/core/types';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { upsertFromServer } from '@/src/core/offline/db/dml';
import { isOnline } from '@/src/core/offline/net/connectivity';
import { RequiresConnectionError } from '@/src/core/offline/errors';
import type { ISubscriptionRepository } from './ISubscriptionRepository';
import { SubscriptionRepository } from './SubscriptionRepository';

/**
 * Offline subscription reads: tiers, tenant+tier, and usage counts all resolve
 * from the local mirror so tier limits + grace days work offline. `upgradeTenant`
 * is billing/entitlement — online-only.
 */
export class OfflineSubscriptionRepository
  extends OfflineBaseRepository
  implements ISubscriptionRepository
{
  private online = new SubscriptionRepository();

  async findAllTiers(): Promise<DbTierPlan[]> {
    const rows = await this.all('SELECT * FROM tier_plans WHERE active = 1 ORDER BY sort_order');
    return this.decodeAll<DbTierPlan>('tier_plans', rows);
  }

  async getTenantWithTier(tenantId: string): Promise<DbTenant | null> {
    const row = await this.first('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    if (!row) return null;
    const tenant = this.decodeOne<DbTenant>('tenants', row)!;
    if (tenant.tier_id) {
      const tiers = await this.rowsById<DbTierPlan>('tier_plans', [tenant.tier_id]);
      tenant.tier_plans = tiers.get(tenant.tier_id) ?? null;
    }
    return tenant;
  }

  // Local DB holds exactly one tenant's data, so counting all local rows equals
  // the tenant's usage (RLS does the same server-side).
  async countTenantUsage(): Promise<TenantUsage> {
    const [customers, users, plans, branches, currencies, products] = await Promise.all([
      this.count('SELECT COUNT(*) AS n FROM customers WHERE active = 1'),
      this.count('SELECT COUNT(*) AS n FROM users WHERE active = 1'),
      this.count('SELECT COUNT(*) AS n FROM plans'),
      this.count('SELECT COUNT(*) AS n FROM branches WHERE active = 1'),
      this.count('SELECT COUNT(*) AS n FROM currencies WHERE active = 1'),
      this.count('SELECT COUNT(*) AS n FROM products WHERE active = 1'),
    ]);
    return { customers, users, plans, branches, currencies, products };
  }

  async upgradeTenant(tenantId: string, tierId: string): Promise<DbTenant> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    const tenant = await this.online.upgradeTenant(tenantId, tierId);
    await upsertFromServer(this.db, 'tenants', tenant, (tenant as { updated_at?: string }).updated_at ?? null);
    return tenant;
  }
}
