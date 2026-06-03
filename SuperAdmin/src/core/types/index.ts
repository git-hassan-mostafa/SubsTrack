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
  multiCurrencyEnabled: boolean;
  multiMonthPlansEnabled: boolean;
  graceDays: number;
  priceMonthlyUsd: number;
  priceYearlyUsd: number | null;
  active: boolean;
}
