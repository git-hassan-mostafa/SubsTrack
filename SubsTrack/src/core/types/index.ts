// Domain models — camelCase. Used by all layers except repositories (which use db.ts).

export type UserRole = 'superadmin' | 'admin' | 'user';
export type MonthStatus = 'paid' | 'unpaid' | 'future' | 'before_start';

export interface Tenant {
  id: string;
  name: string;
  tenantCode: string;
  active: boolean;
  createdAt: string;
}

// Per-tenant non-USD currency. USD is implicit (never stored as a row).
// Convention everywhere in the app: a null Currency reference means USD.
export interface Currency {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  symbol: string | null;
  ratePerUsd: number;
  decimals: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  tenantId: string;
  tenant: Tenant;
}

// Full user record (shown in Users list screen)
export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string | null;
  role: UserRole;
  active: boolean;
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
  durationMonths: number;
  // Currency the stored price is in. null = USD.
  currencyId: string | null;
  tenantId: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phoneNumber: string | null;
  address: string | null;
  active: boolean;
  isRegular: boolean;
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
  amountDue: number;
  amountPaid: number;
  balance: number;
  durationMonths: number;
  // Currency the amounts above are stored in. null = USD.
  currencyId: string | null;
  // Exchange rate (units of currencyId per 1 USD) captured at recording time.
  // USD payments (currencyId === null) always store 1. Frozen — receipt and aggregate
  // USD values use this instead of the live currencies.rate_per_usd.
  ratePerUsdSnapshot: number;
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
  isGroupSecondary: boolean;
  balance: number;
}

export interface DashboardMetrics {
  totalCustomers: number;
  activeCustomers: number;
  monthlyRevenue: number;
  unpaidThisMonth: number;
  totalUsers: number;
  totalPlans: number;
  totalOutstandingBalance: number;
}
