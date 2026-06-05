// DB row types — snake_case, mirrors SQL schema exactly.
// These types MUST NEVER leave the repository layer.

export interface DbTenant {
  id: string;
  name: string;
  tenant_code: string;
  active: boolean;
  tier_id: string;
  tier_upgraded_at: string | null;
  created_at: string;
  // joined relation — present when .select('*, tier_plans(*)')
  tier_plans?: DbTierPlan | null;
}

export interface DbTierPlan {
  id: string;
  code: 'free' | 'pro' | 'business';
  name: string;
  sort_order: number;
  max_customers: number | null;
  max_users: number | null;
  max_plans: number | null;
  max_branches: number | null;
  max_currencies: number | null;
  max_products: number | null;
  multi_currency_enabled: boolean;
  multi_month_plans_enabled: boolean;
  grace_days: number;
  price_monthly_usd: number;
  price_yearly_usd: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}
