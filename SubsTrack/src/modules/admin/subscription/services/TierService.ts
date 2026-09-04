import type {
  TierPlan,
  TenantUsage,
  TierResource,
  Tenant,
} from '@/src/core/types';
import repository from '../repository/SubscriptionRepository';
import { mapDbTenantToTenant, mapDbTierPlanToTierPlan } from '../utils/mapper';
import { TierLimitError } from '../utils/tierLimitError';


interface MaxField {
  customers: 'maxCustomers';
  users: 'maxUsers';
  plans: 'maxPlans';
  branches: 'maxBranches';
  currencies: 'maxCurrencies';
  products: 'maxProducts';
}
const MAX_FIELD: MaxField = {
  customers: 'maxCustomers',
  users: 'maxUsers',
  plans: 'maxPlans',
  branches: 'maxBranches',
  currencies: 'maxCurrencies',
  products: 'maxProducts',
};

class TierService {
  async fetchTiers(): Promise<TierPlan[]> {
    const rows = await repository.findAllTiers();
    return rows.map(mapDbTierPlanToTierPlan);
  }

  async fetchUsage(): Promise<TenantUsage> {
    return repository.countTenantUsage();
  }

  async upgradeTenant(tenantId: string, tierId: string): Promise<Tenant> {
    const db = await repository.upgradeTenant(tenantId, tierId);
    return mapDbTenantToTenant(db);
  }

  async getTenantWithTier(tenantId: string): Promise<Tenant | null> {
    const db = await repository.getTenantWithTier(tenantId);
    return db ? mapDbTenantToTenant(db) : null;
  }

  assertCanCreate(tier: TierPlan, usage: TenantUsage, resource: TierResource): void {
    const limit = tier[MAX_FIELD[resource]];
    if (limit === null) return;
    if (usage[resource] >= limit) {
      throw new TierLimitError(resource, limit, tier.code);
    }
  }

  assertMultiCurrency(tier: TierPlan): void {
    if (!tier.multiCurrencyEnabled) {
      throw new TierLimitError('multi_currency', null, tier.code);
    }
  }

  assertMultiMonth(tier: TierPlan): void {
    if (!tier.multiMonthPlansEnabled) {
      throw new TierLimitError('multi_month', null, tier.code);
    }
  }

  canDowngradeTo(
    targetTier: TierPlan,
    usage: TenantUsage,
  ): { ok: boolean; blockers: { resource: TierResource; current: number; limit: number }[] } {
    const blockers: { resource: TierResource; current: number; limit: number }[] = [];
    (Object.keys(MAX_FIELD) as TierResource[]).forEach((resource) => {
      const limit = targetTier[MAX_FIELD[resource]];
      if (limit !== null && usage[resource] > limit) {
        blockers.push({ resource, current: usage[resource], limit });
      }
    });
    return { ok: blockers.length === 0, blockers };
  }
}

export default new TierService();
