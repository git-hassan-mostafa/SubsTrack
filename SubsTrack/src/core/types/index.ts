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
// no fixed plan). Month charges attach to a line, and each line builds its own
// month grid via PaymentService.buildMonthGrid().
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
  // The bill for this month. null when nothing has ever touched it — an unpaid
  // month writes no row, exactly as before.
  charge: Charge | null;
  // Money received against that bill. 0 whether the charge is missing or merely
  // empty (e.g. after a void), which is why nothing here asks "does a row
  // exist?" — the two states must read identically.
  collected: number;
  isGroupSecondary: boolean;
  // What is still owed on this month: charge.amount - collected.
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
  // Revenue is CASH COLLECTED, not billed — one pass over `collections`, by
  // receivedAt. An unpaid remainder stays a debt and enters revenue only in the
  // month it is actually collected, so nothing is ever counted twice.
  // The breakdown splits the SAME money by what each collection_item paid for
  // (charges.kind), so a partly-paid sale now lands in the right bucket.
  monthlyRevenue: number;    // subscriptionRevenue + salesRevenue + manualRevenue
  subscriptionRevenue: number; // items against 'month' charges
  salesRevenue: number;        // items against 'sale' charges
  manualRevenue: number;       // items against 'manual' charges (custom debts)
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
  // Debt is all-time, never month-scoped, and every part is a real balance —
  // so unlike before, the three categories SUM to totalDebt exactly.
  // A fully unpaid month is NOT debt (it is unpaidThisMonth above); only a
  // PARTLY paid one is.
  totalDebt: number;         // still owed across all customers/categories
  monthsDebt: number;        // partly-paid subscription months
  salesDebt: number;         // open or partly-paid sales
  manualDebt: number;        // hand-typed custom debts
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
  // Currency the amounts are stored in. null = USD.
  currencyId: string | null;
  // USD sales store 1. Mirrors Charge.ratePerUsdSnapshot.
  ratePerUsdSnapshot: number;
  soldAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  notes: string | null;
  createdAt: string;
  // The sale document holds NO money and NO custody: what is owed for it is its
  // `charges` row (kind 'sale') and what was collected is a `collections` row.
  // A sale can therefore take several payments over time without this row moving.
  //
  // The two fields below are DERIVED from that bill, never stored columns — the
  // service fills them in after reading the balance, so a card can still print
  // "20/50" without the sale document owning money again. 0 / null on the lean
  // reads that only need the header.
  amountPaid: number;
  chargeId: string | null;
  // The product lines. Present on list/detail reads; empty on lean reads (debt/wallet
  // use itemsSummary instead).
  items: SaleItem[];
  // Joined for display in lists/receipts.
  customer?: Customer | null;
}

// ── Ledger: charges + collections ───────────────────────────────────────────
// Two facts, deliberately kept apart:
//   CHARGE      what the customer owes — a month, a sale, or a hand-typed fee.
//   COLLECTION  money physically handed over, with COLLECTION_ITEMS saying
//               which charges it paid.
// One bill can take many collections (installments) and one collection can
// settle many bills (the oldest-first waterfall) — a many-to-many that a single
// `amountPaid` column can never record. What has been paid is therefore NEVER a
// field on Charge; it is the sum of its items (see ChargeBalance).

export type ChargeKind = 'month' | 'sale' | 'manual';

// Derived, never stored. 'void' = the bill was a mistake; 'written_off' = it is
// real but will never be paid (a recorded loss).
export type ChargeStatus = 'open' | 'partial' | 'settled' | 'void' | 'written_off';

export interface Charge {
  id: string;
  tenantId: string;
  // Read ONLY when customerId is null (a walk-in sale). Otherwise the branch is
  // the customer's, so a customer moved to another branch takes their bills.
  branchId: string | null;
  // null only for a walk-in sale charge.
  customerId: string | null;
  kind: ChargeKind;

  // kind === 'month'
  customerPlanId: string | null;
  billingMonth: string | null;
  // Consecutive months this ONE bill covers. billingMonth is the first of them.
  durationMonths: number;
  // Snapshot of which plan applied when the bill was raised. null = custom.
  planId: string | null;

  // kind === 'sale'
  saleId: string | null;

  // kind === 'manual'
  description: string | null;

  // What is owed, in currencyId (null = USD). Frozen — never recomputed.
  amount: number;
  currencyId: string | null;
  // Units of currencyId per 1 USD, frozen when the bill was raised. USD = 1.
  // Converts the OUTSTANDING balance to USD (what he was billed); a collection
  // carries its own rate for what was actually collected.
  ratePerUsdSnapshot: number;

  // When the bill was raised — may be long after dueDate (a January month
  // billed in March, when the collector finally came).
  issuedAt: string;
  // When it must be paid. THE sort key for the waterfall and the only source of
  // ageing. month → the billing day; sale → soldAt or a later agreed date;
  // manual → picked by staff.
  dueDate: string;

  recordedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  // The bill was a MISTAKE — it never existed.
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  // The bill is REAL but will never be paid — a recorded LOSS. Mutually
  // exclusive with a void: they are different statements about the same row.
  writtenOffAt: string | null;
  writtenOffBy: string | null;
  writeOffReason: string | null;
}

// One physical hand-over of cash. This is the ONLY carrier of wallet custody in
// the whole schema, and `receivedAt` is the one revenue date.
export interface Collection {
  id: string;
  tenantId: string;
  branchId: string | null;
  customerId: string | null;
  // The cash handed over, in currencyId (null = USD). Always equals the sum of
  // its items — the service guarantees it.
  amount: number;
  currencyId: string | null;
  // Frozen when the money arrived. THIS is the rate every revenue and wallet
  // figure uses (cash basis).
  ratePerUsdSnapshot: number;
  receivedAt: string;
  receivedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  // Collector wallet: who holds this cash now. null = nobody (settled).
  heldByUserId: string | null;
  remittedAt: string | null;
  remittedBy: string | null;
  // Loaded by the reads that need the split (a receipt, the history sheet).
  items?: CollectionItem[];
}

// Where one slice of a collection went. `amount` is in the PARENT COLLECTION's
// currency, which the service guarantees equals the charge's — so a balance
// always closes at exactly zero, with no rate drift and no currency of its own.
export interface CollectionItem {
  id: string;
  tenantId: string;
  collectionId: string;
  chargeId: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
  // Loaded when the row must be labelled ("Jan 2026 · Internet").
  charge?: Charge | null;
}

// One month's bill and the money that has reached it. The ONLY shape
// buildMonthGrid accepts, so the grid never learns that collections exist and
// stays the pure function it has always been.
//
// `collected` is 0 both when the bill has no money and when there is no bill at
// all — which is exactly why nothing in the app asks "does a charge row exist?".
// An untouched January and one whose collection was voided must read the same.
export interface MonthBill {
  charge: Charge;
  collected: number;
}

// A live bill plus what has been collected against it. Comes from the
// `charge_balances` view on the server and the equivalent GROUP BY offline, so
// one mapper serves both. Voided and written-off charges are excluded at source.
export interface ChargeBalance {
  chargeId: string;
  amount: number;
  paid: number;
  balance: number;
}

// ── Owed vs debt ────────────────────────────────────────────────────────────
// OWED  everything with a balance, INCLUDING plain unpaid months. Only the
//       waterfall consumes this.
// DEBT  the subset shown on the Debts screen: partial months, open/partial
//       sales, custom fees. A fully unpaid month is NOT a debt — it is
//       `unpaid`/`overdue` in the month grid, which is its own workflow.
//       isDebt(item) = balance > 0 && (kind !== 'month' || paid > 0)

// One line of what a customer owes, whatever its source. A month that has never
// been touched has NO charge row, so `chargeId` is null and the row was derived
// from buildMonthGrid — collecting money is what turns it into a real bill.
export interface OpenItem {
  // null = a virtual month; the waterfall materializes its charge on payment.
  chargeId: string | null;
  kind: ChargeKind;
  customerId: string;
  customerName: string;
  // Whose branch the money belongs to. Carried so that collecting from a debts
  // list — which never loads the full customer — still files the cash correctly.
  branchId: string | null;
  // month rows only — the natural key a virtual row is deduped and hashed on.
  customerPlanId: string | null;
  billingMonth: string | null;
  durationMonths: number;
  planId: string | null;
  saleId: string | null;
  // "Jan 2026 · Internet" | "Sale #12 · Router" | "Installation fee"
  label: string;
  amount: number;
  paid: number;
  balance: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  dueDate: string;
  issuedAt: string;
  createdAt: string;
  // False for a plain unpaid month — it is owed, but the Debts screen omits it.
  isDebt: boolean;
}

// One proposed line of a collection, before it is saved. The collect sheet
// renders these as its split preview and lets staff untick one to steer the
// money to the next item.
export interface AllocationLine {
  item: OpenItem;
  amount: number;
  // True when this line closes the bill outright.
  settles: boolean;
}

// What a customer owes, split the way the Debts screen shows it.
export interface CustomerDebts {
  customerId: string;
  customerName: string;
  // The debt rows — never plain unpaid months.
  items: OpenItem[];
  // Plain unpaid months, shown as the muted "+2 unpaid months" hint and as
  // their own section in the customer sheet. The waterfall reaches these too.
  unpaidMonths: OpenItem[];
  debtUsd: number;
  unpaidMonthsUsd: number;
  // Days past due on the oldest debt row. 0 when nothing is late yet.
  oldestDaysLate: number;
}

// Totals for the current Debts filter scope, in USD (the screen formats into
// the display currency). These ADD UP now — there is no net-vs-gross split,
// because every row carries its own balance.
export interface DebtSummary {
  totalUsd: number;
  monthsUsd: number;
  salesUsd: number;
  manualUsd: number;
  customerCount: number;
  // Money given up on in the period — reported, never counted as owed.
  writtenOffUsd: number;
}

export interface DebtsView {
  customers: CustomerDebts[];
  summary: DebtSummary;
}

// A collection row for the money-in history (all customers, one customer, or
// one wallet). `itemCount` decides whether the card shows its single line
// inline or a "3 items" expander.
export interface CollectionListItem {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  receivedAt: string;
  receivedByUserId: string | null;
  heldByUserId: string | null;
  branchId: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  itemCount: number;
  // Frozen-at-read labels of what this hand-over paid, in allocation order.
  itemLabels: string[];
  items: CollectionItem[];
  // The one kind every line shares, or 'mixed'. Drives the wallet's type filter.
  kind: WalletSource;
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

// What a held hand-over PAID FOR. A collection can settle several bills at
// once, so 'mixed' is a real state — the wallet says so rather than pretending
// the cash belongs to one stream.
export type WalletSource = 'month' | 'sale' | 'manual' | 'mixed';

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
  // Secondary descriptor shown under the customer: what this money settled,
  // joined ("Jan 2026 · Internet, Router"). null when nothing could be named.
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
  | 'charges'
  | 'collections'
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
  id: string;              // the collection_item's id — the drill-down key
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
  // The hand-over this slice belongs to. Several rows can share one, which is
  // what a mixed payment looks like once it is split by bill.
  collectionId: string;
}

// What a slice of cash PAID FOR. It is charges.kind, because that is the only
// honest answer once one hand-over can settle a month and a sale at the same
// time — the money is split by the bills it closed, never by the row it arrived
// on. This is exactly why the reports' parts now add up to their total.
export type CashStream = ChargeKind;

// A CollectedRow tagged with which stream it came from. What ReportsService
// hands the aggregators and the drill-down sheet.
export interface CashRow extends CollectedRow {
  stream: CashStream;
}
