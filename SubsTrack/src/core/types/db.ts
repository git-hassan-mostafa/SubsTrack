// DB row types — snake_case, mirrors SQL schema exactly.
// These types MUST NEVER leave the repository layer.

export interface DbTenant {
  id: string;
  name: string;
  tenant_code: string;
  active: boolean;
  created_at: string;
}

export interface DbSaasTier {
  id: string;
  name: string;
  max_users: number;
  max_customers: number;
  price: number;
  grace_days: number;
  tenant_id: string;
  created_at: string;
}

export interface DbUser {
  id: string;
  username: string;
  full_name: string;
  phone_number: string | null;
  role: 'superadmin' | 'admin' | 'user';
  tenant_id: string;
  created_at: string;
}

export interface DbPlan {
  id: string;
  name: string;
  price: number | null;
  is_custom_price: boolean;
  tenant_id: string;
  created_at: string;
}

export interface DbCustomer {
  id: string;
  name: string;
  phone_number: string | null;
  address: string | null;
  active: boolean;
  plan_id: string | null;
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
  amount: number;
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
