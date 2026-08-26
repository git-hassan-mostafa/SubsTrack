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
  // Collector wallet: who holds this cash now. null = nobody (settled/unattributed).
  heldByUserId: string | null;
  // Final settlement: when the cash left the wallet chain, and who took it out.
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
  // Money OUT this month, on the same cash basis: a stock purchase counts when
  // it was PAID FOR, not when the goods sell. monthlyRevenue above stays GROSS —
  // netIncome is the subtraction, so no existing number changes meaning.
  // Admin-only: all four are 0 when the caller isn't an admin (not computed).
  monthlyExpenses: number;   // stockExpenses + customExpenses
  stockExpenses: number;     // derived from stock_movements.unit_cost
  customExpenses: number;    // hand-typed rows in the expenses table
  netIncome: number;         // monthlyRevenue − monthlyExpenses (can be negative)
  // This month's collection population, from one pass (see UnpaidMonthCount):
  // dueThisMonth counts only customers the month actually asks money from, so a
  // not-yet-due, skipped, not-yet-started or non-regular customer is in neither.
  unpaidThisMonth: number;
  dueThisMonth: number;
  totalUsers: number;
  totalPlans: number;
  // Debt is all-time, never month-scoped. totalDebt is NET (after debt payments)
  // while the two category fields are GROSS, so the parts read larger than the
  // total — the tile shows them side by side anyway, by the owner's choice.
  totalDebt: number;         // net debt still owed across all customers/categories
  monthsDebt: number;        // gross portion from partial subscription payments
  salesDebt: number;         // gross portion from partial sales
  // Collector wallets — cash on hand: collected and not yet settled out of the
  // system, wherever it sits in the chain (the viewer's own wallet included).
  // Admin-only: 0 when the caller isn't an admin (not computed then). USD.
  walletCash: number;        // total cash held across every wallet in scope (net, USD)
  walletCollectors: number;  // # of users currently holding cash
  walletTransactions: number;// # of held transactions behind that cash
  // Growth this month
  newCustomersThisMonth: number;
  cancelledThisMonth: number;
  // Activity this month
  paymentsCollectedCount: number; // # of subscription payments received this month
  salesCount: number;             // # of one-off sales this month
  // Comparison (canonical USD) — the same three cash streams as monthlyRevenue.
  prevMonthRevenue: number;       // total revenue of the previous month
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
  // What the product costs to BUY — the default that pre-fills a restock.
  // null = unknown. `currencyId` above is the SELLING currency, hence its own.
  costPrice: number | null;
  costCurrencyId: string | null;
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

// One entry in a product's stock ledger. Never deleted, and a 'sale' row is only
// ever soft-voided (voiding a sale voids its movements). A MANUAL row can be
// corrected in place — quantity, cost and note only, audited — for a wrong
// record; something that really happened afterwards is a new movement instead.
// See docs/features.md → Products & One-Off Sales → Editing a stock entry.
export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  // Signed: positive adds stock, negative removes it.
  quantityDelta: number;
  reason: StockReason;
  saleId: string | null;
  // What one unit cost to buy, on a positive movement — the only money on the
  // ledger, and what makes a stock purchase an expense. null = no cost recorded
  // (every legacy row, every 'sale'). All three are written together.
  unitCost: number | null;
  currencyId: string | null;
  ratePerUsdSnapshot: number | null;
  note: string | null;
  recordedByUserId: string | null;
  occurredAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  createdAt: string;
}

// A SERVICE the tenant sells: labour, not goods — installation, a repair visit.
// Products' twin, minus stock and cost: nothing is bought, so a service is never
// an expense (staff pay is typed by hand under the `salaries` expense category).
// Sold as a line on a Sale, so every money figure counts it via the sale header.
// branchId: null = SHARED price-list entry. active = false is a soft-delete.
export interface Service {
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

// What a sale line sells. A 'service' line may have no serviceId at all — that is
// the ONE-OFF typed service, whose itemNameSnapshot is the whole record of the job.
export type SaleLineType = 'product' | 'service';

// One line within a sale — a product or a service. A sale (header) holds one or
// more, in any mix. itemNameSnapshot + unitAmount are FROZEN at create time.
// unitAmount is in the parent sale's currency (one currency per sale). lineTotal
// is derived, not stored.
export interface SaleItem {
  id: string;
  saleId: string;
  tenantId: string;
  lineType: SaleLineType;
  // Only the one matching lineType is set — and BOTH are null on a one-off
  // typed service. Anything reading stock must narrow on productId first.
  productId: string | null;
  serviceId: string | null;
  itemNameSnapshot: string;
  // Always 1 on a service line — labour is one job at one price, so the form
  // shows no stepper and unitAmount IS the whole fee.
  quantity: number;
  unitAmount: number;
  // Derived: unitAmount * quantity (no DB column).
  lineTotal: number;
  createdAt: string;
  // Joined for display in the receipt.
  product?: Product | null;
  service?: Service | null;
}

// A sale (header). Holds ONE OR MORE items via `items` — products, services, or
// both. customerId is OPTIONAL (walk-in supported). itemsSummary, totalAmount, and
// ratePerUsdSnapshot are FROZEN at create time — receipts and historical totals
// never drift when the catalog or FX rates change. One currency per sale (all
// items share `currencyId`).
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
  // Collector wallet: who holds this cash (amountPaid) now. null = nobody.
  heldByUserId: string | null;
  // Final settlement: when the cash left the wallet chain, and who took it out.
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
  // Collector wallet: who holds this cash now. null = nobody (settled/unattributed).
  heldByUserId: string | null;
  // Final settlement: when the cash left the wallet chain, and who took it out.
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
  /**
   * What was collected out of what was owed on the record behind this debt, in
   * the row's own currency (so remaining = due − paid). Both null for a custom
   * debt, which has no record behind it — its amount IS the debt.
   */
  amountPaid: number | null;
  amountDue: number | null;
  /**
   * The payment behind a `months` row, carried whole because the query that
   * builds these rows already selects it in full — opening its receipt must not
   * re-fetch what the app is holding. Null on every other category: a `sales`
   * row's query is deliberately lean (no `sale_items`), so that receipt is
   * loaded on demand, and a custom debt has no record at all.
   */
  payment: Payment | null;
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
  // Who holds the cash now (null = nobody). The wallet groups on this.
  heldByUserId: string | null;
}

// Net summary for the current Debts filter scope. All values in USD (the screen
// formats into the user's display currency).
export interface DebtSummary {
  grossUsd: number;
  paymentsUsd: number;
  netUsd: number;
}

// ── Expenses ─────────────────────────────────────────────────────────────────
// Money the business SPENT — the counterweight to the three cash-in streams, so
// the dashboard can show a real net. Two sources, one view:
//   • stored  — hand-typed rows in the `expenses` table (rent, salaries, fuel…)
//   • derived — the cost of buying stock, computed at runtime from
//               stock_movements.unit_cost (never a written row, so correcting
//               stock corrects the expense too — the DebtService precedent).
// CASH BASIS, like revenue: a purchase counts in the month it was PAID FOR, not
// the month the goods are sold. Admin-only end to end.

// The stored categories. 'stock' is never hand-picked — it labels the derived
// rows. Labels + icons live in modules/transaction/expenses/utils/expenseCategories.ts.
export type ExpenseCategory =
  | 'stock'
  | 'rent'
  | 'salaries'
  | 'utilities'
  | 'fuel'
  | 'transport'
  | 'maintenance'
  | 'equipment'
  | 'internet'
  | 'taxes'
  | 'marketing'
  | 'other';

// A stored expense row. (Derived stock costs are ExpenseItems only.)
export interface Expense {
  id: string;
  tenantId: string;
  // null = a company-wide expense, not charged to one branch.
  branchId: string | null;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  // Currency the amount is stored in. null = USD.
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  recordedByUserId: string | null;
  // When the money went out (user-picked) — what every month bucket keys off.
  incurredAt: string;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  notes: string | null;
}

// One row in the Expenses list: a stored expense OR a derived stock cost,
// unified for display. `amount` is in the row's own currency.
export interface ExpenseItem {
  // Prefixed ('exp:…' / 'stock:…') so the two sources can never collide.
  id: string;
  source: 'manual' | 'stock';
  category: ExpenseCategory;
  // The description, or "Water ×100" for a stock purchase.
  label: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  // incurred_at / occurred_at — when the money went out.
  date: string;
  branchId: string | null;
  recordedByUserId: string | null;
  // Stock rows only — lets the card open the product.
  productId: string | null;
  // false for derived rows: fix a wrong stock cost on the stock entry itself,
  // there is no expense row to void.
  canVoid: boolean;
}

// Totals for the current Expenses scope, in USD (the screen formats into the
// user's display currency).
export interface ExpenseSummary {
  totalUsd: number;
  manualUsd: number;
  stockUsd: number;
}

export interface ExpensesView {
  items: ExpenseItem[];
  summary: ExpenseSummary;
}

// ── Collector Wallet ─────────────────────────────────────────────────────────
// Cash a user is physically holding right now. DERIVED at runtime — never stored
// as a balance. A wallet = every non-voided cash row whose held_by_user_id is
// that user: payments.amount_paid + sales.amount_paid + debt_payments.amount.
// Receiving moves the cash UP the chain (collector → branch admin → tenant-wide
// admin) by re-pointing held_by_user_id; it never destroys it. The cash leaves
// the system only when it is settled (held_by_user_id = NULL + remitted_at/by):
// a superadmin receiving it, or a tenant-wide admin closing out their own wallet.
// Who may receive from whom lives in modules/wallet/utils/custody.ts.
// Void / edit of a source row self-corrects.

export type WalletSource = 'payment' | 'sale' | 'debt_payment';

// Why the viewer cannot receive a given wallet. null = they can.
export type ReceiveBlock =
  | 'self'   // it's their own cash
  | 'rank'   // the holder is not below them in the chain
  | 'branch' // a branch admin, and the holder isn't in their branch
  | null;

// One held transaction sitting in someone's wallet.
// `amount` is the cash collected, in the row's own currency.
export interface WalletItem {
  id: string;
  source: WalletSource;
  // Who collected it originally — unchanged by handovers, so a received wallet
  // can still show "Collected by <name>". The name is null when the holder IS
  // the collector (nothing to say) or when that user can't be resolved.
  collectorUserId: string;
  collectorName: string | null;
  // Who holds it now. Equals collectorUserId until the first handover.
  holderUserId: string;
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

// Physical cash a holder has in ONE currency: the raw sum (what you'd count
// in notes/bills) plus its canonical USD value (Σ amount/rate — drift-free).
export interface WalletCurrencyTotal {
  currencyId: string | null;
  amount: number; // raw cash in this currency
  usd: number;    // canonical USD value
}

// One user's wallet: the cash they are holding. The three viewer-dependent
// flags are filled by WalletService from custody.ts, so the UI never re-decides
// who may act on it.
export interface UserWallet {
  holderUserId: string;
  holderName: string;
  active: boolean; // false = deactivated user who still holds cash
  byCurrency: WalletCurrencyTotal[];
  itemCount: number;
  totalUsd: number;
  isSelf: boolean;             // the viewer's own wallet
  receiveBlock: ReceiveBlock;  // null = the viewer may receive this cash
  canCloseOut: boolean;        // the viewer may settle it out of the system
}

// One wallet plus the individual transactions that make it up.
export interface UserWalletDetail extends UserWallet {
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
// and custom_debts / debt_payments are append-only + voidable, so the Debts view
// is their own history. stock_movements records EDITS ONLY — the ledger row is
// its own create entry, so auditing the insert would duplicate the stock history;
// what nothing else remembers is a quantity or cost changed after the fact.
// See docs/features.md → Audit Trail.
export type AuditTable =
  | 'payments'
  | 'sales'
  | 'customers'
  | 'customer_plans'
  | 'skipped_months'
  | 'plans'
  | 'products'
  | 'services'
  | 'stock_movements'
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

// ---------------------------------------------------------------- reporting

// One row of cash that ARRIVED. The three money-in sources (subscription
// payments, sales, debt payments) each return this exact shape, so every report
// aggregation is one pass over one array and never branches on the source.
// USD is always `amount / ratePerUsdSnapshot` — the row's FROZEN rate, so a
// later rate edit cannot drift a historical figure.
export interface CollectedRow {
  id: string;              // the source row's id — the drill-down key
  date: string;            // ISO instant the money arrived (paid_at / sold_at)
  amount: number;          // as collected, in its own currency
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  branchId: string | null;
  receivedByUserId: string | null;
  customerId: string | null;
  customerName: string | null; // joined, for the drill-down list
  planId: string | null;       // subscriptions only — feeds per-plan revenue
  label: string | null;        // what the money was for (plan / items / note)
}

export type CashStream = 'subscription' | 'sale' | 'debt';

// A CollectedRow tagged with which stream it came from. What ReportsService
// hands the aggregators and the drill-down sheet.
export interface CashRow extends CollectedRow {
  stream: CashStream;
}
