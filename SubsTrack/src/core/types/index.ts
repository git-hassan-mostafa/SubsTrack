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
  maxProducts: number | null;
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
  products: number;
}

export type TierResource = 'customers' | 'users' | 'plans' | 'branches' | 'currencies' | 'products';

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
  // Branch this customer belongs to. null = UNASSIGNED — visible only to
  // tenant-wide admins. Branch-scoped users never see unassigned customers.
  branchId: string | null;
  tenantId: string;
  startDate: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  // The customer's service lines (one plan each). Present when loaded with
  // .select('*, customer_plans(*, plans(*))'). A customer can hold several.
  customerPlans?: CustomerPlan[];
}

// A single service line: one plan a customer is subscribed to, with its own
// start/cancel lifecycle. planId null = custom/occasional line (ad-hoc amounts,
// no fixed plan). Payments attach to a line, and each line builds its own month
// grid via PaymentService.buildMonthGrid().
export interface CustomerPlan {
  id: string;
  customerId: string;
  planId: string | null;
  startDate: string;
  cancelledAt: string | null;
  active: boolean;
  tenantId: string;
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
  // The service line (customer_plans row) this payment settles.
  customerPlanId: string;
  // Snapshot of which plan applied at recording time. null = custom/no plan.
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
  subscriptionRevenue: number;
  salesRevenue: number;
  unpaidThisMonth: number;
  totalUsers: number;
  totalPlans: number;
  totalOutstandingBalance: number;
}

// One-off sellable item. Distinct from Plan (recurring subscription).
// branchId: null = SHARED catalog item (visible to every branch) — same semantic as Plan.
// active = false is a soft-delete (preserves Sale history).
export interface Product {
  id: string;
  tenantId: string;
  branchId: string | null;
  name: string;
  description: string | null;
  price: number;
  // Currency the stored price is in. null = USD.
  currencyId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// A single product sale. customerId is OPTIONAL (walk-in supported).
// productNameSnapshot, unitAmount, and ratePerUsdSnapshot are FROZEN at create time —
// receipts and historical totals never drift when the catalog or FX rates change.
export interface Sale {
  id: string;
  tenantId: string;
  branchId: string | null;
  productId: string;
  productNameSnapshot: string;
  customerId: string | null;
  recordedByUserId: string | null;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  // How much was collected at sale time. A partial sale (amountPaid < totalAmount)
  // leaves a "Sales" debt (remaining = totalAmount - amountPaid).
  amountPaid: number;
  // Currency the amounts are stored in. null = USD.
  currencyId: string | null;
  // USD sales store 1. Mirrors Payment.ratePerUsdSnapshot.
  ratePerUsdSnapshot: number;
  soldAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  notes: string | null;
  createdAt: string;
  // Joined for display in lists/receipts.
  product?: Product | null;
  customer?: Customer | null;
}

// ── Debts ───────────────────────────────────────────────────────────────────
// A customer's total debt is DERIVED at runtime, never stored:
//   net = sum(all category debts) - sum(debt payments)
// Only the two sources without a source transaction are stored: CustomDebt
// (hand-typed) and DebtPayment. "months"/"sales" debts come from partial
// payments / partial sales.

export type DebtCategory = 'months' | 'sales' | 'services' | 'custom';

// A hand-typed debt with no source transaction.
export interface CustomDebt {
  id: string;
  tenantId: string;
  customerId: string;
  description: string | null;
  amount: number;
  // Currency the amount is stored in. null = USD.
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  recordedByUserId: string | null;
  incurredAt: string;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  notes: string | null;
}

// Money paid against a customer's total debt. Tied only to the customer.
export interface DebtPayment {
  id: string;
  tenantId: string;
  customerId: string;
  amount: number;
  // Currency the amount is stored in. null = USD.
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  receivedByUserId: string | null;
  paidAt: string;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  notes: string | null;
}

// One row in the Debts flat list (a partial month, a partial sale, or a custom
// debt), unified for display. `remaining` is in the row's own currency.
export interface DebtItem {
  id: string;
  category: DebtCategory;
  customerId: string;
  customerName: string;
  // e.g. "Jan 2026 · Internet", the product name snapshot, or a custom description.
  label: string;
  remaining: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  // billing_month / sold_at / incurred_at — used for sorting.
  date: string;
  sourceType: 'payment' | 'sale' | 'custom_debt';
}

// A debt-payment row for the "Payments" view of the Debts list.
export interface DebtPaymentItem {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  paidAt: string;
  notes: string | null;
}

// Net summary for the current Debts filter scope. All values in USD (the screen
// formats into the user's display currency).
export interface DebtSummary {
  grossUsd: number;
  paymentsUsd: number;
  netUsd: number;
}

// Global app-wide key/value config (NOT tenant-scoped). Managed by the SaaS
// owner in the SuperAdmin "Options" page; READ-ONLY in SubsTrack.
// e.g. key 'LiraRate' = default USD→LBP rate seeded onto new tenants.
export interface AppOption {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
