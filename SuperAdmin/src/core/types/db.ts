// DB row types — snake_case, mirrors SQL schema exactly.
// These types MUST NEVER leave the repository layer.

export interface DbTenant {
  id: string;
  name: string;
  tenant_code: string;
  active: boolean;
  customer_allowance: number;
  price_per_customer_usd: number;
  created_at: string;
}

export interface DbCustomerRequest {
  id: string;
  tenant_id: string;
  requested_count: number;
  granted_count: number | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAppOption {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}
