// Single source of truth for the local SQLite mirror. Drives:
//   1. CREATE TABLE + ADD COLUMN reconcile on every app start (schema.ts / applySchema.ts)
//   2. row encode/decode at the repository boundary (codec.ts)
//   3. generic upserts in the sync engine (pull/push)
// Columns mirror src/core/types/db.ts EXACTLY (snake_case). Keeping one
// descriptor avoids the three places drifting apart.
//
// Adding a table or a column here is the WHOLE local schema change — existing
// installs pick it up on next start (no migration list). Removing/renaming a
// column or changing a type/constraint is NOT reconciled; see docs/offline.md.

export type ColType =
  | 'text' // TEXT
  | 'int' //  INTEGER (counts, durations, decimals, sort order)
  | 'num' //  numeric/money/rate — stored as TEXT (exact decimal), decoded via Number()
  | 'bool' // boolean — stored as INTEGER 0/1
  | 'json'; // object/array ↔ Postgres jsonb — stored as TEXT (stringified), decoded via JSON.parse

export interface TableSpec {
  name: string;
  /** ordered column → type. `id` is always the TEXT primary key. */
  columns: Record<string, ColType>;
  /**
   * Extra table-level constraints appended to CREATE TABLE. Applied only when
   * the table is CREATED — SQLite can't ALTER one in, so adding a constraint
   * here later reaches fresh installs only (docs/offline.md).
   */
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
  /**
   * Log/ledger table whose rows are NEVER modified after insert. Two effects:
   *  1. pushed with ON CONFLICT DO NOTHING — a re-sent batch (the server
   *     committed but the reply was lost) must not need UPDATE rights, which an
   *     insert-only RLS table like audit_logs does not grant. A plain upsert
   *     would take the DO UPDATE path, be refused forever, and wedge the queue.
   *  2. un-pushed rows do NOT block an organization switch (hasUnsyncedWrites) —
   *     a log is not the user's money, and blocking a login over one is wrong.
   */
  appendOnly?: boolean;
  /**
   * Keep only a rolling window locally: pull rows whose `occurred_at` is within
   * N days and prune older local rows (pruneWindowedTables in sync.ts). The
   * server keeps everything; older history is read online on demand.
   */
  pullDays?: number;
}

/** Days of audit history the local mirror keeps. Older entries are online-only. */
export const AUDIT_LOCAL_DAYS = 30;

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
      price_monthly_usd: 'num', price_yearly_usd: 'num',
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
      cancelled_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'customer_plans',
    scope: 'tenant',
    columns: {
      id: 'text', customer_id: 'text', plan_id: 'text', start_date: 'text', cancelled_at: 'text',
      active: 'bool', custom_price: 'num', custom_currency_id: 'text',
      tenant_id: 'text', created_at: 'text', updated_at: 'text',
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
      held_by_user_id: 'text', remitted_at: 'text', remitted_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
    // Mirrors the server upsert conflict target — enforces one payment per
    // service line per month locally, so replay is idempotent (gotcha #1).
    constraints: ['UNIQUE (customer_plan_id, billing_month)'],
    generated: ['balance'], // server: GENERATED ALWAYS AS (amount_due - amount_paid)
  },
  {
    // Months a service line is not expected to pay. `skipped` toggles; the row
    // is kept when unskipped so the change syncs like any other update.
    name: 'skipped_months',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', customer_id: 'text', customer_plan_id: 'text',
      billing_month: 'text', skipped: 'bool', note: 'text', skipped_by_user_id: 'text',
      created_at: 'text', updated_at: 'text',
    },
    // Mirrors the server's natural key, so a deterministic id keeps two devices
    // skipping the same month converging instead of duplicating.
    constraints: ['UNIQUE (customer_plan_id, billing_month)'],
  },
  {
    name: 'products',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text', name: 'text', description: 'text',
      price: 'num', currency_id: 'text',
      // What it costs to buy — pre-fills a restock. Separate from the selling currency.
      cost_price: 'num', cost_currency_id: 'text',
      active: 'bool', created_at: 'text', updated_at: 'text',
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
      void_reason: 'text', notes: 'text',
      held_by_user_id: 'text', remitted_at: 'text', remitted_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
    // total_amount is app-written (sum of sale_items line totals) — NOT generated.
    // amount_paid is also client-written.
  },
  {
    // One product line per sale. A line an edit drops is soft-voided, not
    // deleted — the engine has no tombstones, so a delete would never reach the
    // other devices' mirrors.
    name: 'sale_items',
    scope: 'tenant',
    columns: {
      id: 'text', sale_id: 'text', tenant_id: 'text', product_id: 'text',
      product_name_snapshot: 'text', quantity: 'int', unit_amount: 'num',
      voided_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    // Stock ledger. Stock on hand is SUM(quantity_delta) over non-voided rows —
    // never a counter column, so two devices selling offline can't clobber each
    // other. quantity_delta MUST stay 'int': 'num' maps to TEXT, and SUM() over
    // TEXT compares by storage class.
    name: 'stock_movements',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', product_id: 'text', quantity_delta: 'int',
      reason: 'text', sale_id: 'text',
      // What the stock cost to buy — the source of the derived stock expenses.
      unit_cost: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      note: 'text', recorded_by_user_id: 'text',
      occurred_at: 'text', voided_at: 'text', voided_by: 'text',
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
      held_by_user_id: 'text', remitted_at: 'text', remitted_by: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    // Hand-typed expenses only — stock purchase costs are derived from
    // stock_movements.unit_cost and never stored here. Owns its branch_id.
    // Admin-only on the server, so a collector's mirror simply stays empty.
    name: 'expenses',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text',
      category: 'text', description: 'text',
      amount: 'num', currency_id: 'text', rate_per_usd_snapshot: 'num',
      recorded_by_user_id: 'text', incurred_at: 'text',
      voided_at: 'text', voided_by: 'text', void_reason: 'text', notes: 'text',
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
    name: 'tenant_settings',
    scope: 'tenant',
    columns: {
      id: 'text', tenant_id: 'text', key: 'text', value: 'text',
      created_at: 'text', updated_at: 'text',
    },
  },
  {
    name: 'exception_logs',
    scope: 'tenant',
    pushOnly: true,
    appendOnly: true,
    columns: {
      id: 'text', tenant_id: 'text', user_id: 'text', username: 'text',
      source: 'text', message: 'text', stack: 'text', context: 'text',
      occurred_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
  {
    // Append-only audit trail, written by the repositories next to each change
    // (never by a DB trigger — a trigger would record the sync moment, not the
    // action). Pulled with a rolling 30-day window; the server keeps everything.
    name: 'audit_logs',
    scope: 'tenant',
    appendOnly: true,
    pullDays: AUDIT_LOCAL_DAYS,
    columns: {
      id: 'text', tenant_id: 'text', branch_id: 'text',
      table_name: 'text', record_id: 'text', action: 'text',
      before_data: 'json', after_data: 'json', changed: 'json',
      label: 'text', subject: 'text', subject_id: 'text',
      actor_user_id: 'text', actor_username: 'text',
      occurred_at: 'text', created_at: 'text', updated_at: 'text',
    },
  },
];

export const TABLE_BY_NAME: Record<string, TableSpec> = Object.fromEntries(
  TABLES.map((t) => [t.name, t]),
);

/**
 * Every table the sync engine touches, ordered parents-before-children (matters
 * for FK-ish merges). The PUSH loop iterates this array too, so a table missing
 * from here is neither pushed nor pulled.
 */
export const SYNC_PULL_ORDER = [
  'tenants', 'tier_plans', 'app_options', 'tenant_settings', 'currencies', 'branches', 'users',
  'plans', 'customers', 'customer_plans', 'payments', 'skipped_months',
  'products', 'sales', 'sale_items', 'stock_movements', 'custom_debts',
  'debt_payments', 'expenses', 'exception_logs', 'audit_logs',
] as const;
