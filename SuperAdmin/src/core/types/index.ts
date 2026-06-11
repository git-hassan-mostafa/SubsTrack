export type TierCode = 'free' | 'pro' | 'business';

export interface Tenant {
  id: string;
  name: string;
  tenantCode: string;
  active: boolean;
  tierId: string;
  tier?: TierPlan | null;
  tierUpgradedAt: string | null;
  createdAt: string;
}

export interface TierPlan {
  id: string;
  code: TierCode;
  name: string;
  sortOrder: number;
  maxCustomers: number | null;
  maxUsers: number | null;
  maxPlans: number | null;
  maxBranches: number | null;
  maxCurrencies: number | null;
  maxProducts: number | null;
  multiCurrencyEnabled: boolean;
  multiMonthPlansEnabled: boolean;
  graceDays: number;
  priceMonthlyUsd: number;
  priceYearlyUsd: number | null;
  active: boolean;
}

// Global app-wide key/value config (NOT tenant-scoped), managed by the SaaS
// owner from the Options page. e.g. key 'LiraRate' = default USD→LBP rate
// seeded onto each new tenant's Lebanese Pound currency.
export interface AppOption {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
