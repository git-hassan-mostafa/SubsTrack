// Domain models — camelCase. Used by all layers except repositories (which use db.ts).

export type UserRole = 'superadmin' | 'admin' | 'user';
export type MonthStatus = 'paid' | 'unpaid' | 'future';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  tenantId: string;
}

// Full user record (shown in Users list screen)
export interface AppUser {
  id: string;
  username: string;
  phoneNumber: string | null;
  role: UserRole;
  tenantId: string;
  createdAt: string;
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

export interface Plan {
  id: string;
  name: string;
  price: number | null;
  isCustomPrice: boolean;
  tenantId: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phoneNumber: string | null;
  address: string | null;
  active: boolean;
  planId: string | null;
  tenantId: string;
  startDate: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  plan?: Plan | null;
}

export interface Payment {
  id: string;
  billingMonth: string;
  amount: number;
  customerId: string;
  planId: string | null;
  receivedByUserId: string | null;
  tenantId: string;
  paidAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MonthEntry {
  year: number;
  month: number;
  label: string;
  billingMonth: string;
  status: MonthStatus;
  payment: Payment | null;
}

export interface DashboardMetrics {
  totalCustomers: number;
  activeCustomers: number;
  monthlyRevenue: number;
  unpaidThisMonth: number;
}
