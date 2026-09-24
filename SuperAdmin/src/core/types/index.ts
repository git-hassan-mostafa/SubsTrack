// pendingRequest is zipped on by TenantService.getTenants, not a DB column.
export interface Tenant {
  id: string;
  name: string;
  tenantCode: string;
  active: boolean;
  customerAllowance: number;
  planAllowance: number;
  pricePerPlanUsd: number;
  whatsappEnabled: boolean;
  pendingRequest: CustomerRequest | null;
  createdAt: string;
}

export type CustomerRequestStatus =
  "pending" | "accepted" | "declined" | "cancelled";

export interface CustomerRequest {
  id: string;
  tenantId: string;
  requestedCount: number;
  grantedCount: number | null;
  requestedPlans: number;
  grantedPlans: number | null;
  status: CustomerRequestStatus;
  decidedAt: string | null;
  createdAt: string;
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

// active is null for a table that has no active flag (plans).
export interface TenantCount {
  total: number;
  active: number | null;
}

// Row counts the tenant details sheet lists — no money, no statistics.
export interface TenantCounts {
  users: TenantCount;
  branches: TenantCount;
  customers: TenantCount;
  serviceLines: TenantCount;
  plans: TenantCount;
  products: TenantCount;
  services: TenantCount;
  currencies: TenantCount;
}
