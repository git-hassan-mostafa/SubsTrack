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
  multi_currency_enabled: boolean;
  multi_month_plans_enabled: boolean;
  grace_days: number;
  price_monthly_usd: number;
  price_yearly_usd: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbCurrency {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  symbol: string | null;
  rate_per_usd: number;
  decimals: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbBranch {
  id: string;
  tenant_id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbUser {
  id: string;
  username: string;
  full_name: string;
  phone_number: string | null;
  role: 'superadmin' | 'admin' | 'user';
  active: boolean;
  tenant_id: string;
  branch_id: string | null;
  created_at: string;
  // joined relation — present when .select('*, branches(*)')
  branches?: DbBranch | null;
}

export interface DbPlan {
  id: string;
  name: string;
  price: number | null;
  is_custom_price: boolean;
  duration_months: number;
  currency_id: string | null;
  branch_id: string | null;
  tenant_id: string;
  created_at: string;
}

export interface DbCustomer {
  id: string;
  name: string;
  phone_number: string | null;
  address: string | null;
  area: string | null;
  notes: string | null;
  active: boolean;
  is_regular: boolean;
  plan_id: string | null;
  branch_id: string | null;
  tenant_id: string;
  start_date: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // joined relation — present when .select('*, plans(*)')
  plans?: DbPlan | null;
}

export interface DbPayment {
  id: string;
  billing_month: string;
  amount_due: number;
  amount_paid: number;
  balance: number;
  duration_months: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  customer_id: string;
  plan_id: string | null;
  received_by_user_id: string | null;
  tenant_id: string;
  paid_at: string;
  voided_at: string | null;
  voided_by: string | null;
  notes: string | null;
  created_at: string;
}
