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
  branchId: string | null;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number | null;
  isCustomPrice: boolean;
  durationMonths: number;
  currencyId: string | null;
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
  locationUrl: string | null;
  active: boolean;
  isRegular: boolean;
  branchId: string | null;
  tenantId: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  customPrice: number | null;
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
  charge: Charge | null;
  collected: number;
  isGroupSecondary: boolean;
  balance: number;
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
  notDueLineIds: string[];
  uncoveredLineIds: string[];
}

export interface DashboardMetrics {
  totalCustomers: number;
  activeCustomers: number;
  monthlyRevenue: number;
  subscriptionRevenue: number;
  salesRevenue: number;
  manualRevenue: number;
  monthlyExpenses: number;
  stockExpenses: number;
  customExpenses: number;
  netIncome: number;
  unpaidThisMonth: number;
  dueThisMonth: number;
  totalUsers: number;
  totalPlans: number;
  totalDebt: number;
  monthsDebt: number;
  salesDebt: number;
  manualDebt: number;
  walletCash: number;
  walletCollectors: number;
  walletTransactions: number;
  newCustomersThisMonth: number;
  cancelledThisMonth: number;
  paymentsCollectedCount: number;
  salesCount: number;
  prevMonthRevenue: number;
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
  currencyId: string | null;
  costPrice: number | null;
  costCurrencyId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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
  quantityDelta: number;
  reason: StockReason;
  saleId: string | null;
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
  productId: string | null;
  serviceId: string | null;
  itemNameSnapshot: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  createdAt: string;
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
  itemsSummary: string;
  customerId: string | null;
  recordedByUserId: string | null;
  totalAmount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  soldAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  notes: string | null;
  createdAt: string;
  amountPaid: number;
  chargeId: string | null;
  charge: Charge | null;
  items: SaleItem[];
  customer?: Customer | null;
}


export type ChargeKind = 'month' | 'sale' | 'manual';

// Derived, never stored. 'void' = the bill was a mistake; 'written_off' = it is
// real but will never be paid (a recorded loss).
export type ChargeStatus = 'open' | 'partial' | 'settled' | 'void' | 'written_off';

export interface Charge {
  id: string;
  tenantId: string;
  branchId: string | null;
  customerId: string | null;
  kind: ChargeKind;

  customerPlanId: string | null;
  billingMonth: string | null;
  durationMonths: number;
  planId: string | null;

  saleId: string | null;

  description: string | null;

  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;

  issuedAt: string;
  dueDate: string;

  recordedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
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
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  receivedAt: string;
  receivedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  heldByUserId: string | null;
  remittedAt: string | null;
  remittedBy: string | null;
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


// One line of what a customer owes, whatever its source. A month that has never
// been touched has NO charge row, so `chargeId` is null and the row was derived
// from buildMonthGrid — collecting money is what turns it into a real bill.
export interface OpenItem {
  chargeId: string | null;
  kind: ChargeKind;
  customerId: string;
  customerName: string;
  branchId: string | null;
  customerPlanId: string | null;
  billingMonth: string | null;
  durationMonths: number;
  planId: string | null;
  saleId: string | null;
  label: string;
  amount: number;
  paid: number;
  balance: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  dueDate: string;
  issuedAt: string;
  createdAt: string;
  isDebt: boolean;
  openAmount?: boolean;
  charge?: Charge | null;
}

// One proposed line of a collection, before it is saved. The collect sheet
// renders these as its split preview and lets staff untick one to steer the
// money to the next item.
export interface AllocationLine {
  item: OpenItem;
  amount: number;
  settles: boolean;
}

// What a customer owes, split the way the Debts screen shows it.
export interface CustomerDebts {
  customerId: string;
  customerName: string;
  items: OpenItem[];
  unpaidMonths: OpenItem[];
  debtUsd: number;
  unpaidMonthsUsd: number;
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
  voidedBy: string | null;
  voidReason: string | null;
  itemCount: number;
  itemLabels: string[];
  items: CollectionItem[];
  kind: WalletSource;
}


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
  branchId: string | null;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
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

// One row in the Expenses list: a stored expense OR a derived stock cost,
// unified for display. `amount` is in the row's own currency.
export interface ExpenseItem {
  id: string;
  source: 'manual' | 'stock';
  category: ExpenseCategory;
  label: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  date: string;
  branchId: string | null;
  recordedByUserId: string | null;
  productId: string | null;
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


// What a held hand-over PAID FOR. A collection can settle several bills at
// once, so 'mixed' is a real state — the wallet says so rather than pretending
// the cash belongs to one stream.
export type WalletSource = 'month' | 'sale' | 'manual' | 'mixed';

// Why the viewer cannot receive a given wallet. null = they can.
export type ReceiveBlock =
  | 'self'
  | 'rank'
  | 'branch'
  | null;

// One held transaction sitting in someone's wallet.
// `amount` is the cash collected, in the row's own currency.
export interface WalletItem {
  id: string;
  source: WalletSource;
  collectorUserId: string;
  collectorName: string | null;
  holderUserId: string;
  customerId: string | null;
  customerName: string | null;
  label: string | null;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  date: string;
}

// Physical cash a holder has in ONE currency: the raw sum (what you'd count
// in notes/bills) plus its canonical USD value (Σ amount/rate — drift-free).
export interface WalletCurrencyTotal {
  currencyId: string | null;
  amount: number;
  usd: number;
}

// One user's wallet: the cash they are holding. The three viewer-dependent
// flags are filled by WalletService from custody.ts, so the UI never re-decides
// who may act on it.
export interface UserWallet {
  holderUserId: string;
  holderName: string;
  active: boolean;
  byCurrency: WalletCurrencyTotal[];
  itemCount: number;
  totalUsd: number;
  isSelf: boolean;
  receiveBlock: ReceiveBlock;
  canCloseOut: boolean;
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


// 'void' / 'restore' are updates too, kept distinct so the trail can be filtered
// by what a staff member actually did.
export type AuditAction = 'create' | 'update' | 'delete' | 'void' | 'restore';

// Tables the app records a trail for. sale_items is covered by its parent sale,
// and collection_items have no life apart from their hand-over — a collection's
// after_data carries the whole split. stock_movements records EDITS ONLY — the ledger row is
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
  snapshot: Record<string, unknown> | null;
  context: Record<string, unknown>;
  label: string | null;
  subject: string | null;
  subjectId: string | null;
  actorUserId: string | null;
  actorUsername: string | null;
  occurredAt: string;
}

// Audit list filters. All optional; omitted means "no restriction".
export interface AuditFilter {
  table?: AuditTable;
  action?: AuditAction;
  actorUserId?: string;
  from?: string;
  to?: string;
  branchFilter?: BranchFilter;
}

// When an unbilled month flips to "unpaid" in the month grid.
//   month_start        — on the 1st of the month (the original behavior)
//   customer_start_day — on the service line's own start day-of-month; before
//                        that day THIS month reads as "future" (nothing owed
//                        yet). Last month stays red and owed — it is only not
//                        "Overdue" yet. See gotcha #83.
export type UnpaidStartRule = 'month_start' | 'customer_start_day';


// One row of cash that ARRIVED. The three money-in sources (subscription
// payments, sales, debt payments) each return this exact shape, so every report
// aggregation is one pass over one array and never branches on the source.
// USD is always `amount / ratePerUsdSnapshot` — the row's FROZEN rate, so a
// later rate edit cannot drift a historical figure.
export interface CollectedRow {
  id: string;
  date: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  branchId: string | null;
  receivedByUserId: string | null;
  customerId: string | null;
  customerName: string | null;
  planId: string | null;
  label: string | null;
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
