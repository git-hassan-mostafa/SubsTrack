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
  branch_id: string | null;
  tenant_id: string;
  start_date: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // joined relation — present when .select('*, customer_plans(*, plans(*))')
  customer_plans?: DbCustomerPlan[] | null;
}

// One service line: a single plan a customer is subscribed to, with its own
// lifecycle. plan_id NULL = custom/occasional line (ad-hoc amounts).
export interface DbCustomerPlan {
  id: string;
  customer_id: string;
  plan_id: string | null;
  start_date: string;
  cancelled_at: string | null;
  active: boolean;
  tenant_id: string;
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
  customer_plan_id: string;
  plan_id: string | null;
  received_by_user_id: string | null;
  tenant_id: string;
  paid_at: string;
  voided_at: string | null;
  voided_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProduct {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  description: string | null;
  price: number;
  currency_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbSale {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  product_id: string;
  product_name_snapshot: string;
  customer_id: string | null;
  recorded_by_user_id: string | null;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  // How much of the sale was collected. Partial (< total) leaves a "Sales" debt.
  amount_paid: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  sold_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined relations — present when .select('*, products(*), customers(*)')
  products?: DbProduct | null;
  customers?: DbCustomer | null;
}

// A hand-typed debt with no source transaction (months/sales debts are derived
// at runtime and never stored here). Soft-void only.
export interface DbCustomDebt {
  id: string;
  tenant_id: string;
  customer_id: string;
  description: string | null;
  amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  recorded_by_user_id: string | null;
  incurred_at: string;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
  // joined relation — present when .select('*, customers(*)')
  customers?: DbCustomer | null;
}

// Money a customer paid against their total debt. Tied only to the customer;
// never modifies an underlying payment/sale row. Soft-void only.
export interface DbDebtPayment {
  id: string;
  tenant_id: string;
  customer_id: string;
  amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  received_by_user_id: string | null;
  paid_at: string;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
  // joined relation — present when .select('*, customers(*)')
  customers?: DbCustomer | null;
}

export interface DbAppOption {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}
