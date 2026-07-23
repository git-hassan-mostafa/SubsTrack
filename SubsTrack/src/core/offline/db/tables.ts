// Single source of truth for the local SQLite mirror. Drives:
//   1. CREATE TABLE generation (schema.ts)
//   2. row encode/decode at the repository boundary (codec.ts)
//   3. generic upserts in the sync engine (pull/push)
// Columns mirror src/core/types/db.ts EXACTLY (snake_case). Keeping one
// descriptor avoids the three places drifting apart.

export type ColType =
  | 'text' // TEXT
  | 'int' //  INTEGER (counts, durations, decimals, sort order)
  | 'num' //  numeric/money/rate — stored as TEXT (exact decimal), decoded via Number()
  | 'bool'; // boolean — stored as INTEGER 0/1

export interface TableSpec {
  name: string;
  /** ordered column → type. `id` is always the TEXT primary key. */
  columns: Record<string, ColType>;
  /** extra table-level constraints appended to CREATE TABLE. */
  constraints?: string[];
  /**
   * Columns the SERVER computes (Postgres `GENERATED ALWAYS`). Stored/computed
   * locally like any `num` column, but MUST be stripped from push payloads —
   * Postgres rejects a value for a generated column (SQLSTATE 428C9). See
   * `stripForPush` in sync.ts.
   */
  generated?: string[];
  /**
   * 'tenant'  — tenant-scoped data: gets a `_dirty` flag and offline writes; the
   *             sync pushes its dirty rows and pulls server changes.
   * 'global'  — app-wide read-only cache (tier_plans, app_options): pulled,
   *             never pushed or written locally.
   */
  scope: 'tenant' | 'global';
  /**
   * True for a write-mostly debug/audit log (currently only exception_logs):
   * pushed like any other tenant table, but never pulled back down — pulling
   * it would just fill every device's mirror with every other device's log
   * rows for no benefit. See sync.ts's pullChanges().
   */
  pushOnly?: boolean;
}

export const TABLES: TableSpec[] = [
  {
    name: 'tenants',
    scope: 'tenant',
    columns: {
      id: 'text', name: 'text', tenant_code: 'text', active: 'bool',
      tier_id: 'text', tier_upgraded_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'tier_plans',
    scope: 'global',
    columns: {
      id: 'text', code: 'text', name: 'text', sort_order: 'int',
      max_customers: 'int', max_users: 'int', max_plans: 'int', max_branches: 'int',
      max_currencies: 'int', max_products: 'int',
      multi_currency_enabled: 'bool', multi_month_plans_enabled: 'bool',
      grace_days: 'int', price_monthly_usd: 'num', price_yearly_usd: 'num',
      active: 'bool', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'currencies',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', code: 'text', name: 'text', symbol: 'text',
      rate_per_usd: 'num', decimals: 'int', active: 'bool', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'branches',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', name: 'text', active: 'bool',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'users',
    scope: 'tenant',
    columns: {
      id: 'text', username: 'text', full_name: 'text', phone_number: 'text', role: 'text',
      active: 'bool', tenant_id: 'text', branch_id: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'plans',
    scope: 'tenant',
    columns: {
      id: 'text', name: 'text', price: 'num', is_custom_price: 'bool', duration_months: 'int',
      currency_id: 'text', branch_id: 'text', tenant_id: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'customers',
    scope: 'tenant',
    columns: {
      id: 'text', name: 'text', phone_number: 'text', address: 'text', area: 'text', notes: 'text',
      location_url: 'text', active: 'bool', is_regular: 'bool', branch_id: 'text', tenant_id: 'text',
      start_date: 'text', cancelled_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'customer_plans',
    scope: 'tenant',
    columns: {
      id: 'text', customer_id: 'text', plan_id: 'text', start_date: 'text', cancelled_at: 'text',
      active: 'bool', tenant_id: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'payments',
    scope: 'tenant',
    columns: {
      id: 'text', billing_month: 'text', amount_due: 'num', amount_paid: 'num', balance: 'num',
      duration_months: 'int', currency_id: 'text', rate_per_usd_snapshot: 'num',
      customer_id: 'text', customer_plan_id: 'text', plan_id: 'text', received_by_user_id: 'text',
      tenant_id: 'text', paid_at: 'text', voided_at: 'text', voided_by: 'text', notes: 'text',
      remitted_at: 'text', remitted_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
    // Mirrors the server upsert conflict target — enforces one payment per
    // service line per month locally, so replay is idempotent (gotcha #1).
    constraints: ['UNIQUE (customer_plan_id, billing_month)'],
    generated: ['balance'], // server: GENERATED ALWAYS AS (amount_due - amount_paid)
  },
  {
    name: 'products',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', name: 'text', description: 'text',
      price: 'num', currency_id: 'text', active: 'bool', created_at: 'text', updated_at: 'text',
    },
  },
  {
    // Sale header. Products live in the sale_items child table.
    name: 'sales',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', items_summary: 'text',
      customer_id: 'text', recorded_by_user_id: 'text',
      total_amount: 'num', amount_paid: 'num',
      currency_id: 'text', rate_per_usd_snapshot: 'num', sold_at: 'text',
      voided_at: 'text', voided_by: 'text',
      void_reason: 'text', notes: 'text', remitted_at: 'text', remitted_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
    // total_amount is app-written (sum of sale_items line totals) — NOT generated.
    // amount_paid is also client-written.
  },
  {
    // One product line per sale.
    name: 'sale_items',
    scope: 'tenant',
    columns: {
      id: 'text', sale_id: 'text', tenant_id: 'text', product_id: 'text',
      product_name_snapshot: 'text', quantity: 'int', unit_amount: 'num',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'custom_debts',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', customer_id: 'text', description: 'text',
      amount: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      recorded_by_user_id: 'text', incurred_at: 'text',
      voided_at: 'text', voided_by: 'text', void_reason: 'text', notes: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'debt_payments',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', customer_id: 'text',
      amount: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      received_by_user_id: 'text', paid_at: 'text',
      voided_at: 'text', voided_by: 'text', void_reason: 'text', notes: 'text',
      remitted_at: 'text', remitted_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'app_options',
    scope: 'global',
    columns: {
      id: 'text', key: 'text', value: 'text', description: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'exception_logs',
    scope: 'tenant',
    pushOnly: true,
    columns: {
      id: 'text', tenant_id: 'text', user_id: 'text', username: 'text',
      source: 'text', message: 'text', stack: 'text', context: 'text',
      occurred_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
];

export const TABLE_BY_NAME: Record<string, TableSpec> = Object.fromEntries(
  TABLES.map((t) => [t.name, t]),
);

/** Tables the sync engine pulls (everything; ordered parents-before-children matters for FK-ish merges). */
export const SYNC_PULL_ORDER = [
  'tenants', 'tier_plans', 'app_options', 'currencies', 'branches', 'users',
  'plans', 'customers', 'customer_plans', 'payments', 'products', 'sales',
  'sale_items', 'custom_debts', 'debt_payments', 'exception_logs',
] as const;
