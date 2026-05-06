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
