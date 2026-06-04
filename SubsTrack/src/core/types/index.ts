// Domain models — camelCase. Used by all layers except repositories (which use db.ts).

export type UserRole = 'superadmin' | 'admin' | 'user';
export type MonthStatus = 'paid' | 'partial' | 'unpaid' | 'future' | 'before_start';

export interface Tenant {
  id: string;
  name: string;
  tenantCode: string;
  active: boolean;
  tierId: string;
  tier?: TierPlan | null;
  tierUpgradedAt: string | null;
  createdAt: string;
}

export type TierCode = 'free' | 'pro' | 'business';

// Subscription tier definition (Free / Pro / Business). Read-only from the app;
// edits happen via SuperAdmin. Numeric *max_ columns are null = unlimited.
export interface TierPlan {
  id: string;
  code: TierCode;
  name: string;
  sortOrder: number;
  maxCustomers: number | null;
  maxUsers: number | null;
  maxPlans: number | null;
  maxBranches: number | null;
  maxCurrencies: number | null;
  multiCurrencyEnabled: boolean;
  multiMonthPlansEnabled: boolean;
  graceDays: number;
  priceMonthlyUsd: number;
  priceYearlyUsd: number | null;
  active: boolean;
}

// Current usage counts for a tenant, paired with TierPlan limits to drive
// enforcement and the Subscription screen usage bars.
export interface TenantUsage {
  customers: number;
  users: number;
  plans: number;
  branches: number;
  currencies: number;
}

export type TierResource = 'customers' | 'users' | 'plans' | 'branches' | 'currencies';

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

// Per-tenant branch/zone. Zero branches = single-location tenant.
// Soft-delete via active = false.
export interface Branch {
  id: string;
  tenantId: string;
  name: string;
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
  // null = tenant-wide admin (sees all branches and unassigned records).
  branchId: string | null;
  branch?: Branch | null;
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
  // null = tenant-wide admin. For role='user', a branch is required once
  // the tenant has >=1 branch (enforced in UserService.validate).
  branchId: string | null;
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
  // Branch this plan belongs to. null = SHARED catalog item (available to every branch).
  // Note this is the OPPOSITE semantic of Customer.branchId (where null = unassigned/hidden).
  branchId: string | null;
  tenantId: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phoneNumber: string | null;
  address: string | null;
  area: string | null;
  notes: string | null;
  active: boolean;
  isRegular: boolean;
  planId: string | null;
  // Branch this customer belongs to. null = UNASSIGNED — visible only to
  // tenant-wide admins. Branch-scoped users never see unassigned customers.
  branchId: string | null;
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
