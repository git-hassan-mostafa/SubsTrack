// pendingRequest is zipped on by TenantService.getTenants, not a DB column.
export interface Tenant {
  id: string;
  name: string;
  tenantCode: string;
  active: boolean;
  customerAllowance: number;
  pricePerCustomerUsd: number;
  pendingRequest: CustomerRequest | null;
  createdAt: string;
}

export type CustomerRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface CustomerRequest {
  id: string;
  tenantId: string;
  requestedCount: number;
  grantedCount: number | null;
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
