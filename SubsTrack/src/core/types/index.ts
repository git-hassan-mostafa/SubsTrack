// Domain models — camelCase. Used by all layers except repositories (which use db.ts).

import type { BranchFilter } from '@/src/core/constants';

export type UserRole = 'superadmin' | 'admin' | 'user';
// A partially-paid month (a payment exists but `balance > 0`) is reported as
// `paid` — the remaining amount is tracked as a debt, not as a month status.
// The owed amount still rides along on `MonthEntry.balance` for drill-in views.
// `skipped` = the user marked the month as "nothing expected here". It ranks
// below `paid` (money always wins) and above `future`/`unpaid`, and it is never
// payable — the month must be unskipped first.
export type MonthStatus = 'paid' | 'unpaid' | 'future' | 'before_start' | 'skipped';

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
  // Optional Google Maps share link (stored raw). Empty = no location set.
  locationUrl: string | null;
  active: boolean;
  isRegular: boolean;
  // Branch this customer belongs to. null = UNASSIGNED — visible only to
  // tenant-wide admins. Branch-scoped users never see unassigned customers.
  branchId: string | null;
  tenantId: string;
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
  // A privately negotiated price for THIS line, replacing the plan's price.
  // null = charge the plan's price. Single-month lines only — resolved by
  // resolveLinePrice(), never read directly.
  customPrice: number | null;
  // Currency of customPrice. null = USD.
  customCurrencyId: string | null;
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
  // Collector wallet: when this cash was handed over to an admin. null = still held.
  remittedAt: string | null;
  remittedBy: string | null;
  createdAt: string;
}

// A month marked as "not expected to pay" on ONE service line. Toggled by
// `skipped`; the row is kept when unskipped so the change syncs.
export interface SkippedMonth {
  id: string;
  tenantId: string;
  customerId: string;
  customerPlanId: string;
  billingMonth: string;
  skipped: boolean;
  note: string | null;
  skippedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
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
  // The active skip covering this month, when status === 'skipped'.
  skip: SkippedMonth | null;
}

// Plan tally for the customer-list badge: how many of the customer's in-play
// service lines owe nothing (`paid`) out of every line that has ever had a
// required month (`total`). "Owes nothing" spans ALL of a line's required months
// up to its last one — not just this month — so a line with an old unpaid month
// never counts as paid. A customer with `total >= 2` and `0 < paid < total` is
// "partly paid" — some plans paid, some not.
export interface PlanPaidCount {
  paid: number;
  total: number;
}

// A customer's payment state, aggregated across their active service lines.
// Skipped, not-yet-due and not-yet-started months are treated as non-existent.
//   paid        owes nothing at all, and at least one line owed this month
//   mixed       some lines owe nothing, some still owe ("N/M plans paid")
//   unpaid      no line is fully settled
//   skipped     owes nothing, and nothing is expected this month (deliberate skip)
//   not_due_yet owes nothing YET — no line has started or reached its billing
//               day for THIS month ('customer_start_day' rule)
// The last three all mean "nothing owed", so none of them can appear with
// `CustomerStatus.overdue`; only `mixed` can (and `unpaid`, which the Overdue
// pill replaces).
export type CustomerMonthStatus =
  | "paid"
  | "mixed"
  | "unpaid"
  | "skipped"
  | "not_due_yet";

// Everything the customer list needs about one customer, built in ONE pass from
// buildMonthGrid. `status` answers "is this customer settled, and if not how
// far?" and `overdue` answers "does this customer owe from an EARLIER month?".
// Collapsing them into a single badge is what made a not-due-yet customer with
// old debt read as plain "unpaid" — see gotcha #56.
export interface CustomerStatus {
  status: CustomerMonthStatus;
  overdue: boolean;
  planCount: PlanPaidCount;
  // Lines that must NOT be quick-paid this month: already covered by a payment,
  // or skipped. A not-due-yet line stays payable, so it is absent here.
  notDueLineIds: string[];
  // Lines with an EARLIER month not covered — overdue, or last month still
  // inside its billing-day grace ('customer_start_day'). Months are settled
  // oldest-first, so quick pay must skip these; their backlog is collected from
  // the customer detail grid instead. Wider than the `overdue` flag on purpose:
  // a grace month owes nothing yet but still blocks a later write (gotcha #81b).
  uncoveredLineIds: string[];
}

// One point on the dashboard revenue trend — one calendar month, canonical USD.
export interface RevenuePoint {
  month: string;       // 'YYYY-MM'
  monthIndex: number;  // 0–11, for the months.* label lookup
  year: number;
  subscription: number; // USD collected from subscription payments
  sales: number;        // USD collected on one-off sales
  debt: number;         // USD collected as debt payments
  total: number;        // subscription + sales + debt
}

export interface DashboardMetrics {
  totalCustomers: number;
  activeCustomers: number;
  // Revenue is CASH COLLECTED, not billed: every stream sums what was actually
  // received. An unpaid remainder is a debt and enters revenue only later, as a
  // debt payment — so a partial payment/sale never inflates the month.
  monthlyRevenue: number;    // subscriptionRevenue + salesRevenue + debtRevenue
  subscriptionRevenue: number;
  salesRevenue: number;
  debtRevenue: number;       // debt payments collected this month
  unpaidThisMonth: number;
  totalUsers: number;
  totalPlans: number;
  // Debt is all-time, never month-scoped. totalDebt is NET (after debt payments)
  // while the two category fields are GROSS, so the parts read larger than the
  // total — the tile shows them side by side anyway, by the owner's choice.
  totalDebt: number;         // net debt still owed across all customers/categories
  monthsDebt: number;        // gross portion from partial subscription payments
  salesDebt: number;         // gross portion from partial sales
  // Collector wallets — cash collected but not yet handed over to an admin.
  // Admin-only: 0 when the caller isn't an admin (not computed then). USD.
  walletCash: number;        // total unremitted cash across all collectors (net, USD)
  walletCollectors: number;  // # of collectors currently holding cash
  walletTransactions: number;// # of unremitted transactions behind that cash
  // Growth this month
  newCustomersThisMonth: number;
  cancelledThisMonth: number;
  // Activity this month
  paymentsCollectedCount: number; // # of subscription payments received this month
  salesCount: number;             // # of one-off sales this month
  // Trend / comparison (canonical USD)
  prevMonthRevenue: number;       // total revenue of the previous month
  revenueTrend: RevenuePoint[];   // 6 months ending on the current month
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
  // Derived: SUM(stock_movements.quantityDelta) for this product (no DB column).
  // <= 0 means out of stock — the sale form blocks it. Filled by ProductService.
  stockOnHand: number;
}

// Why a product's stock changed. 'sale' is written automatically by the sale
// flow; the rest come from the product's stock sheet.
export type StockReason = 'initial' | 'restock' | 'adjustment' | 'sale';

// One entry in a product's stock ledger. Rows are never edited or deleted:
// a mistake is corrected with a new 'adjustment', and voiding a sale soft-voids
// the sale's movements.
export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  // Signed: positive adds stock, negative removes it.
  quantityDelta: number;
  reason: StockReason;
  saleId: string | null;
  note: string | null;
  recordedByUserId: string | null;
  occurredAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  createdAt: string;
}

// One product line within a sale. A sale (header) holds one or more of these.
// productNameSnapshot + unitAmount are FROZEN at create time. unitAmount is in the
// parent sale's currency (one currency per sale). lineTotal is derived, not stored.
export interface SaleItem {
  id: string;
  saleId: string;
  tenantId: string;
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitAmount: number;
  // Derived: unitAmount * quantity (no DB column).
  lineTotal: number;
  createdAt: string;
  // Joined for display in the receipt.
  product?: Product | null;
}

// A sale (header). Holds ONE OR MORE products via `items`. customerId is OPTIONAL
// (walk-in supported). itemsSummary, totalAmount, and ratePerUsdSnapshot are FROZEN
// at create time — receipts and historical totals never drift when the catalog or
// FX rates change. One currency per sale (all items share `currencyId`).
export interface Sale {
  id: string;
  tenantId: string;
  branchId: string | null;
  // Frozen human summary of the products (e.g. "Water ×2, Bread") — search + labels.
  itemsSummary: string;
  customerId: string | null;
  recordedByUserId: string | null;
  // Sum of every line's lineTotal, frozen. In `currencyId`.
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
  // Collector wallet: when the collected cash (amountPaid) was handed over. null = still held.
  remittedAt: string | null;
  remittedBy: string | null;
  createdAt: string;
  // The product lines. Present on list/detail reads; empty on lean reads (debt/wallet
  // use itemsSummary instead).
  items: SaleItem[];
  // Joined for display in lists/receipts.
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
  // Collector wallet: when this cash was handed over to an admin. null = still held.
  remittedAt: string | null;
  remittedBy: string | null;
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
  // What the debt is ABOUT: billing_month / sold_at / incurred_at. Display only —
  // a month debt's billing month can be far in the future, so it must never
  // order or group the list.
  date: string;
  /**
   * When the debt was actually recorded (created_at / paid_at / sold_at /
   * incurred_at). This is what sorts and groups every debt view — a November
   * 2027 subscription paid today belongs under "Today", not under 2027.
   */
  createdAt: string;
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
  // Who collected it — used by the collector wallet.
  receivedByUserId: string | null;
}

// Net summary for the current Debts filter scope. All values in USD (the screen
// formats into the user's display currency).
export interface DebtSummary {
  grossUsd: number;
  paymentsUsd: number;
  netUsd: number;
}

// ── Collector Wallet ─────────────────────────────────────────────────────────
// Cash a user (any role) collected but has not yet handed over to an admin.
// DERIVED at runtime — never stored as a balance. A collector's wallet =
// every non-voided, non-remitted cash row they recorded:
//   payments.amount_paid + sales.amount_paid + debt_payments.amount
// Marking a row "received" stamps remitted_at/remitted_by, removing it from the
// wallet. Nothing else is stored. Void / edit of a source row self-corrects.

export type WalletSource = 'payment' | 'sale' | 'debt_payment';

// One unremitted collected transaction sitting in a collector's wallet.
// `amount` is the cash collected, in the row's own currency.
export interface WalletItem {
  id: string;
  source: WalletSource;
  collectorUserId: string;
  // The customer this cash came from. null = a walk-in sale (no customer).
  customerId: string | null;
  customerName: string | null;
  // Secondary descriptor shown under the customer: the plan (subscription) or
  // product (sale). null for debt payments (no sub-line beyond the type).
  label: string | null;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  date: string; // paid_at / sold_at — for sorting + display
}

// Physical cash a collector holds in ONE currency: the raw sum (what you'd count
// in notes/bills) plus its canonical USD value (Σ amount/rate — drift-free).
export interface WalletCurrencyTotal {
  currencyId: string | null;
  amount: number; // raw cash in this currency
  usd: number;    // canonical USD value
}

// One collector's wallet: cash collected but not yet handed over.
export interface CollectorWallet {
  collectorUserId: string;
  collectorName: string;
  active: boolean; // false = deactivated user who still holds cash
  byCurrency: WalletCurrencyTotal[];
  itemCount: number;
  totalUsd: number;
}

// One collector's wallet plus the individual transactions that make it up.
export interface CollectorWalletDetail extends CollectorWallet {
  items: WalletItem[];
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

// Per-tenant key/value config — the tenant-scoped twin of AppOption. Written
// in-app by admins (Admin → Tenant Settings), read by every tenant member.
// e.g. key 'UnpaidStartRule' = when a month turns unpaid.
export interface TenantSetting {
  id: string;
  tenantId: string;
  key: string;
  value: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Audit trail ──────────────────────────────────────────────────────────────

// 'void' / 'restore' are updates too, kept distinct so the trail can be filtered
// by what a staff member actually did.
export type AuditAction = 'create' | 'update' | 'delete' | 'void' | 'restore';

// Tables the app records a trail for. sale_items is covered by its parent sale,
// and stock_movements is already an append-only ledger with its own history UI —
// auditing either would just duplicate itself. custom_debts / debt_payments are
// out too: both are append-only + voidable, so the Debts view is their own history.
// See docs/features.md → Audit Trail.
export type AuditTable =
  | 'payments'
  | 'sales'
  | 'customers'
  | 'customer_plans'
  | 'skipped_months'
  | 'plans'
  | 'products'
  | 'branches'
  | 'currencies'
  | 'users'
  | 'tenant_settings'
  | 'tenants';

// Where a set of audit rows actually came from — an OUTCOME, never a user choice.
//   'server' — the complete history (plus this device's un-pushed rows merged in)
//   'local'  — the device's rolling 30-day window, because the server was unreachable
export type AuditSource = 'server' | 'local';

// One row to pull the trail for. Several of these merge into one timeline when an
// entity spans more than one table (a customer plus its service lines).
export interface AuditRecordTarget {
  table: AuditTable;
  recordId: string;
}

// One field that changed, ready to render as "old → new".
export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
}

// One entry in the audit trail. `changes` is empty for create/delete — those
// carry the whole row in `snapshot` instead.
export interface AuditEntry {
  id: string;
  tenantId: string;
  branchId: string | null;
  table: AuditTable;
  recordId: string;
  action: AuditAction;
  changes: AuditChange[];
  /** create: the whole new row. delete: the whole removed row. update: null. */
  snapshot: Record<string, unknown> | null;
  /**
   * Every column value this entry knows — what changed, plus any context column
   * carried for decoding (`tenant_settings.key`). A display formatter for one
   * column reads its siblings from here; never rendered as a change.
   */
  context: Record<string, unknown>;
  label: string | null;
  /**
   * Who the record belongs to — the customer behind a payment / sale / skip /
   * plan line. Frozen at write time, so it survives the customer being deleted.
   * null for a record that belongs to nobody (a plan, a setting, a staff member).
   */
  subject: string | null;
  /** The same owner as an id — what a customer's whole timeline is filtered on. */
  subjectId: string | null;
  actorUserId: string | null;
  actorUsername: string | null;
  /** Device clock at the moment the staff member acted — NOT the sync moment. */
  occurredAt: string;
}

// Audit list filters. All optional; omitted means "no restriction".
export interface AuditFilter {
  table?: AuditTable;
  action?: AuditAction;
  actorUserId?: string;
  /** Inclusive ISO bounds on occurredAt. */
  from?: string;
  to?: string;
  /**
   * The active branch picker selection. RLS already hides other branches from a
   * branch-scoped user, but a tenant-wide admin sees everything — so the picker
   * has to narrow the trail here. 'shared' semantics: a specific branch also
   * keeps the tenant-wide rows (branch_id IS NULL), which is where plan,
   * setting and staff changes live.
   */
  branchFilter?: BranchFilter;
}

// When an unbilled month flips to "unpaid" in the month grid.
//   month_start        — on the 1st of the month (the original behavior)
//   customer_start_day — on the service line's own start day-of-month; before
//                        that day THIS month reads as "future" (nothing owed
//                        yet). Last month stays red and owed — it is only not
//                        "Overdue" yet. See gotcha #83.
export type UnpaidStartRule = 'month_start' | 'customer_start_day';
