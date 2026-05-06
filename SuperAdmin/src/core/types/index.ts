export interface Tenant {
  id: string;
  name: string;
  tenantCode: string;
  active: boolean;
  createdAt: string;
  saasTier?: SaasTier | null;
}

export interface SaasTier {
  id: string;
  name: string;
  maxUsers: number;
  maxCustomers: number;
  price: number;
  graceDays: number;
  tenantId: string;
  createdAt: string;
}
