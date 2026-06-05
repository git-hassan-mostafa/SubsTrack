import type {
  TierPlan,
  TenantUsage,
  TierResource,
  TierCode,
  Tenant,
} from '@/src/core/types';
import type { DbTierPlan, DbTenant } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import { SubscriptionRepository } from '../repository/SubscriptionRepository';

export function mapDbTenantToTenant(db: DbTenant): Tenant {
  return {
    id: db.id,
    name: db.name,
    tenantCode: db.tenant_code,
    active: db.active,
    tierId: db.tier_id,
    tier: db.tier_plans ? mapDbTierPlanToTierPlan(db.tier_plans) : null,
    tierUpgradedAt: db.tier_upgraded_at,
    createdAt: db.created_at,
  };
}

export function mapDbTierPlanToTierPlan(db: DbTierPlan): TierPlan {
  return {
    id: db.id,
    code: db.code,
    name: db.name,
    sortOrder: db.sort_order,
    maxCustomers: db.max_customers,
    maxUsers: db.max_users,
    maxPlans: db.max_plans,
    maxBranches: db.max_branches,
    maxCurrencies: db.max_currencies,
    maxProducts: db.max_products,
    multiCurrencyEnabled: db.multi_currency_enabled,
    multiMonthPlansEnabled: db.multi_month_plans_enabled,
    graceDays: db.grace_days,
    priceMonthlyUsd: Number(db.price_monthly_usd),
    priceYearlyUsd: db.price_yearly_usd === null ? null : Number(db.price_yearly_usd),
    active: db.active,
  };
}

// Thrown when a service-level limit check fails. The store catches this
// (instanceof check), reads the structured fields, and the UI swaps in
// the UpgradePromptModal instead of an ErrorBanner. We do NOT parse strings.
export class TierLimitError extends Error {
  readonly resource: TierResource | 'multi_currency' | 'multi_month';
  readonly limit: number | null;
  readonly tierCode: TierCode;

  constructor(
    resource: TierLimitError['resource'],
    limit: number | null,
    tierCode: TierCode,
  ) {
    super(i18n.t('errors.tier_limit_reached', { resource, limit: limit ?? '∞' }));
    this.name = 'TierLimitError';
    this.resource = resource;
    this.limit = limit;
    this.tierCode = tierCode;
  }
}

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

export class TierService {
  private repository = new SubscriptionRepository();

  async fetchTiers(): Promise<TierPlan[]> {
    const rows = await this.repository.findAllTiers();
    return rows.map(mapDbTierPlanToTierPlan);
  }

  async fetchUsage(): Promise<TenantUsage> {
    return this.repository.countTenantUsage();
  }

  async upgradeTenant(tenantId: string, tierId: string): Promise<Tenant> {
    const db = await this.repository.upgradeTenant(tenantId, tierId);
    return mapDbTenantToTenant(db);
  }

  async getTenantWithTier(tenantId: string): Promise<Tenant | null> {
    const db = await this.repository.getTenantWithTier(tenantId);
    return db ? mapDbTenantToTenant(db) : null;
  }

  // Throws TierLimitError if the tenant has hit the limit for `resource`.
  // Called from every feature Service.createX() right after its existing validate().
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

  // Returns the list of resources/features that would exceed the target tier's
  // limits if the tenant downgraded. Empty array = safe to downgrade.
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

export const tierService = new TierService();
