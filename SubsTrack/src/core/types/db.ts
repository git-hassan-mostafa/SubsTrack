// DB row types — snake_case, mirrors SQL schema exactly.
// These types MUST NEVER leave the repository layer.

export interface DbTenant {
  id: string;
  name: string;
  tenant_code: string;
  active: boolean;
  tier_id: string;
  tier_upgraded_at: string | null;
  created_at: string;
  // joined relation — present when .select('*, tier_plans(*)')
  tier_plans?: DbTierPlan | null;
}

export interface DbTierPlan {
  id: string;
  code: 'free' | 'pro' | 'business';
  name: string;
  sort_order: number;
  max_customers: number | null;
  max_users: number | null;
  max_plans: number | null;
  max_branches: number | null;
  max_currencies: number | null;
  max_products: number | null;
  multi_currency_enabled: boolean;
  multi_month_plans_enabled: boolean;
  price_monthly_usd: number;
  price_yearly_usd: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbCurrency {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  symbol: string | null;
  rate_per_usd: number;
  decimals: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbBranch {
  id: string;
  tenant_id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbUser {
  id: string;
  username: string;
  full_name: string;
  phone_number: string | null;
  role: 'superadmin' | 'admin' | 'user';
  active: boolean;
  tenant_id: string;
  branch_id: string | null;
  created_at: string;
  // joined relation — present when .select('*, branches(*)')
  branches?: DbBranch | null;
}

export interface DbPlan {
  id: string;
  name: string;
  price: number | null;
  is_custom_price: boolean;
  duration_months: number;
  currency_id: string | null;
  branch_id: string | null;
  tenant_id: string;
  created_at: string;
}

export interface DbCustomer {
  id: string;
  name: string;
  phone_number: string | null;
  address: string | null;
  area: string | null;
  notes: string | null;
  location_url: string | null;
  active: boolean;
  is_regular: boolean;
  branch_id: string | null;
  tenant_id: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // joined relation — present when .select('*, customer_plans(*, plans(*))')
  customer_plans?: DbCustomerPlan[] | null;
}

// One service line: a single plan a customer is subscribed to, with its own
// lifecycle. plan_id NULL = custom/occasional line (ad-hoc amounts).
export interface DbCustomerPlan {
  id: string;
  customer_id: string;
  plan_id: string | null;
  start_date: string;
  cancelled_at: string | null;
  active: boolean;
  // Special price for this line only, replacing the plan's price. NULL = use the plan's.
  custom_price: number | null;
  // Currency of custom_price. NULL = USD.
  custom_currency_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  // joined relation — present when .select('*, plans(*)')
  plans?: DbPlan | null;
}

export interface DbPayment {
  id: string;
  billing_month: string;
  amount_due: number;
  amount_paid: number;
  balance: number;
  duration_months: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  customer_id: string;
  customer_plan_id: string;
  plan_id: string | null;
  received_by_user_id: string | null;
  tenant_id: string;
  paid_at: string;
  voided_at: string | null;
  voided_by: string | null;
  notes: string | null;
  // Collector wallet: who holds this cash now. null = nobody (settled/unattributed).
  held_by_user_id: string | null;
  // Final settlement: when the cash left the wallet chain, and who took it out.
  remitted_at: string | null;
  remitted_by: string | null;
  created_at: string;
  updated_at: string;
}

// A month one service line is not expected to pay. `skipped` is a toggle: the
// row stays when the skip is removed so `updated_at` carries the change to
// other devices. Carries no money.
export interface DbSkippedMonth {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_plan_id: string;
  billing_month: string;
  skipped: boolean;
  note: string | null;
  skipped_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProduct {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  description: string | null;
  price: number;
  currency_id: string | null;
  // What the product costs to BUY — the default that pre-fills a restock.
  // null = unknown, and a restock then records no cost. cost_currency_id null = USD.
  cost_price: number | null;
  cost_currency_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Sale header. Products live in DbSaleItem rows (the sale_items child table).
export interface DbSale {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  // Frozen product summary — search + labels (no sale_items join needed).
  items_summary: string;
  customer_id: string | null;
  recorded_by_user_id: string | null;
  // Sum of every line's (unit_amount * quantity). App-written (not generated).
  total_amount: number;
  // How much of the sale was collected. Partial (< total) leaves a "Sales" debt.
  amount_paid: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  sold_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
  // Collector wallet: who holds this cash (amount_paid) now. null = nobody.
  held_by_user_id: string | null;
  // Final settlement: when the cash left the wallet chain, and who took it out.
  remitted_at: string | null;
  remitted_by: string | null;
  created_at: string;
  updated_at: string;
  // joined relations — present when .select('*, sale_items(*, products(*)), customers(*)')
  sale_items?: DbSaleItem[];
  customers?: DbCustomer | null;
}

// One entry in a product's stock ledger. Stock on hand is SUM(quantity_delta)
// over the non-voided rows — there is no counter column on products.
export interface DbStockMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  // Signed: positive adds stock, negative removes it.
  quantity_delta: number;
  reason: DbStockReason;
  // Set only for reason = 'sale'.
  sale_id: string | null;
  // What one unit cost to buy, on a positive movement. The Expenses view derives
  // one row per costed movement (quantity_delta * unit_cost). null = no cost
  // recorded, so it contributes nothing — every legacy and every 'sale' row.
  // The three always travel together; rate is frozen at buy time (1 for USD).
  unit_cost: number | null;
  currency_id: string | null;
  rate_per_usd_snapshot: number | null;
  note: string | null;
  recorded_by_user_id: string | null;
  occurred_at: string;
  // Soft-void: voiding a sale voids its movements (never inserts opposite ones).
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DbStockReason = 'initial' | 'restock' | 'adjustment' | 'sale';

// One product line of a sale (sale_items table).
export interface DbSaleItem {
  id: string;
  sale_id: string;
  tenant_id: string;
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_amount: number;
  created_at: string;
  updated_at: string;
  // joined relation — present when .select('*, products(*)')
  products?: DbProduct | null;
}

// A hand-typed debt with no source transaction (months/sales debts are derived
// at runtime and never stored here). Soft-void only.
export interface DbCustomDebt {
  id: string;
  tenant_id: string;
  customer_id: string;
  description: string | null;
  amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  recorded_by_user_id: string | null;
  incurred_at: string;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
  // joined relation — present when .select('*, customers(*)')
  customers?: DbCustomer | null;
}

// Money a customer paid against their total debt. Tied only to the customer;
// never modifies an underlying payment/sale row. Soft-void only.
export interface DbDebtPayment {
  id: string;
  tenant_id: string;
  customer_id: string;
  amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  received_by_user_id: string | null;
  paid_at: string;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
  // Collector wallet: who holds this cash now. null = nobody (settled/unattributed).
  held_by_user_id: string | null;
  // Final settlement: when the cash left the wallet chain, and who took it out.
  remitted_at: string | null;
  remitted_by: string | null;
  // joined relation — present when .select('*, customers(*)')
  customers?: DbCustomer | null;
}

// One hand-typed business expense (rent, salaries, fuel…). The cost of buying
// stock is NOT stored here — it is derived from stock_movements.unit_cost.
// Owns its branch_id (null = a company-wide expense). Soft-void only, no edit.
export interface DbExpense {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  category: string;
  description: string | null;
  amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  recorded_by_user_id: string | null;
  // When the money went out (user-picked) — what every month bucket keys off.
  incurred_at: string;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
}

export interface DbAppOption {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTenantSetting {
  id: string;
  tenant_id: string;
  key: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

// 'void' / 'restore' are updates too, kept distinct so the trail can be filtered
// by what a staff member actually did.
export type DbAuditAction = 'create' | 'update' | 'delete' | 'void' | 'restore';

// One entry in the append-only audit trail. Built by the app next to each change
// (never by a DB trigger — see sql scripts/script.sql → AUDIT LOGS). `before_data`
// / `after_data` hold ONLY the changed columns on an edit; a create carries the
// whole new row in `after_data`, a delete the whole removed row in `before_data`.
export interface DbAuditLog {
  id: string;
  tenant_id: string;
  // Denormalized from the changed row (or its parent). null = tenant-wide record.
  branch_id: string | null;
  table_name: string;
  record_id: string;
  action: DbAuditAction;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  changed: string[] | null;
  label: string | null;
  // Who the record belongs to (the customer). Frozen like `label`, for the same
  // reason: a deleted customer leaves no name to resolve an id to.
  subject: string | null;
  // The same owner as an id — what "everything about this customer" filters on.
  // Frozen too: it is never joined back to `customers`, only compared.
  subject_id: string | null;
  actor_user_id: string | null;
  // Snapshot: survives the user row being deleted.
  actor_username: string | null;
  // Device clock at the moment the staff member acted — NOT the sync moment.
  occurred_at: string;
  created_at: string;
  updated_at: string;
}
