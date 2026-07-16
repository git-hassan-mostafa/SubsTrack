import type { DbTierPlan, DbTenant } from '@/src/core/types/db';
import type { TenantUsage } from '@/src/core/types';

export interface ISubscriptionRepository {
  findAllTiers(): Promise<DbTierPlan[]>;
  getTenantWithTier(tenantId: string): Promise<DbTenant | null>;
  countTenantUsage(): Promise<TenantUsage>;
  upgradeTenant(tenantId: string, tierId: string): Promise<DbTenant>;
}
