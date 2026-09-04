export interface DbTenant {
  id: string;
  name: string;
  tenant_code: string;
  active: boolean;
  tier_id: string;
  tier_upgraded_at: string | null;
  created_at: string;
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
  custom_price: number | null;
  custom_currency_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  plans?: DbPlan | null;
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
  cost_price: number | null;
  cost_currency_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// The price list of LABOUR sold — products' twin for work instead of goods, so
// no stock and no cost columns (nothing is bought, so nothing is an expense).
export interface DbService {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  description: string | null;
  price: number;
  currency_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Sale header. Its products AND services live in DbSaleItem rows (sale_items).
export interface DbSale {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  items_summary: string;
  customer_id: string | null;
  recorded_by_user_id: string | null;
  total_amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  sold_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sale_items?: DbSaleItem[];
  customers?: DbCustomer | null;
}

// One entry in a product's stock ledger. Stock on hand is SUM(quantity_delta)
// over the non-voided rows — there is no counter column on products.
export interface DbStockMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  quantity_delta: number;
  reason: DbStockReason;
  sale_id: string | null;
  unit_cost: number | null;
  currency_id: string | null;
  rate_per_usd_snapshot: number | null;
  note: string | null;
  recorded_by_user_id: string | null;
  occurred_at: string;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DbStockReason = 'initial' | 'restock' | 'adjustment' | 'sale';

export type DbSaleLineType = 'product' | 'service';

// One line of a sale (sale_items table) — a product or a service.
export interface DbSaleItem {
  id: string;
  sale_id: string;
  tenant_id: string;
  line_type: DbSaleLineType;
  product_id: string | null;
  service_id: string | null;
  item_name_snapshot: string;
  quantity: number;
  unit_amount: number;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  products?: DbProduct | null;
  services?: DbService | null;
}


// One bill: a subscription month, a sale, or a hand-typed fee.
export interface DbCharge {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  customer_id: string | null;
  kind: 'month' | 'sale' | 'manual';
  customer_plan_id: string | null;
  billing_month: string | null;
  duration_months: number;
  plan_id: string | null;
  sale_id: string | null;
  description: string | null;
  amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  issued_at: string;
  due_date: string;
  recorded_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  written_off_at: string | null;
  written_off_by: string | null;
  write_off_reason: string | null;
  customers?: DbCustomer | null;
  customer_plans?: DbCustomerPlan | null;
  sales?: DbSale | null;
}

// One physical hand-over of cash. The ONLY carrier of wallet custody, and
// received_at is the one revenue date.
export interface DbCollection {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  customer_id: string | null;
  amount: number;
  currency_id: string | null;
  rate_per_usd_snapshot: number;
  received_at: string;
  received_by_user_id: string | null;
  notes: string | null;
  kind: 'month' | 'sale' | 'manual' | 'mixed' | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  held_by_user_id: string | null;
  remitted_at: string | null;
  remitted_by: string | null;
  collection_items?: DbCollectionItem[];
  customers?: DbCustomer | null;
}

// Which bill one slice of a collection paid. amount is in the PARENT
// COLLECTION's currency (guaranteed equal to the charge's), so this row needs
// no currency or rate of its own and a balance closes at exactly zero.
export interface DbCollectionItem {
  id: string;
  tenant_id: string;
  collection_id: string;
  charge_id: string;
  amount: number;
  created_at: string;
  updated_at: string;
  charges?: DbCharge | null;
}

// The charge_balances view on the server; the equivalent GROUP BY over the
// mirror offline. A VOIDED charge is excluded at source; a WRITTEN-OFF one is
// NOT — it keeps the money already collected (#115). "No longer owed" is
// decided once, by ChargeRepository.findOpenWithPaid.
export interface DbChargeBalance {
  id: string;
  tenant_id: string;
  amount: number;
  paid: number;
  balance: number;
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
  branch_id: string | null;
  table_name: string;
  record_id: string;
  action: DbAuditAction;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  changed: string[] | null;
  label: string | null;
  subject: string | null;
  subject_id: string | null;
  actor_user_id: string | null;
  actor_username: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}
