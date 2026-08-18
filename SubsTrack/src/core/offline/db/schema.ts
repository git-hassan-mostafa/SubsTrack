import { TABLES, type ColType, type TableSpec } from "./tables";

const SQL_TYPE: Record<ColType, string> = {
  text: "TEXT",
  int: "INTEGER",
  num: "TEXT", // numeric/money/rate stored as exact decimal text
  bool: "INTEGER",
  json: "TEXT", // stringified object/array; server side is jsonb
};

// Local-only sync flag (stripped before push). `_dirty` = 1 while a local
// change awaits push; the push scans WHERE _dirty = 1.
const DIRTY_COLUMN: [string, string] = ["_dirty", "_dirty INTEGER NOT NULL DEFAULT 0"];

/**
 * Every column of a table as `[name, SQL definition]`, in declaration order.
 * Shared by CREATE TABLE and the ADD COLUMN reconcile in `applySchema.ts`, so a
 * column is declared exactly once. Definitions must stay ALTER-able: no PRIMARY
 * KEY / UNIQUE, and no NOT NULL without a constant DEFAULT (`id` is the sole
 * exception — it only ever ships with a freshly created table).
 */
export function columnDefs(t: TableSpec): [string, string][] {
  const cols: [string, string][] = Object.entries(t.columns).map(([name, type]) => [
    name,
    name === "id" ? "id TEXT PRIMARY KEY NOT NULL" : `${name} ${SQL_TYPE[type]}`,
  ]);
  cols.push(DIRTY_COLUMN);
  return cols;
}

function createTableSql(t: TableSpec): string {
  const body = [
    ...columnDefs(t).map(([, def]) => def),
    ...(t.constraints ?? []),
  ].join(",\n  ");
  return `CREATE TABLE IF NOT EXISTS ${t.name} (\n  ${body}\n);`;
}

// Note: the local mirror does NOT declare SQL foreign keys. Rows arrive out of
// order during pull, so FK enforcement would wrongly reject them. `PRAGMA
// foreign_keys` stays off.
export const CREATE_TABLE_STATEMENTS: string[] = [
  ...TABLES.map(createTableSql),

  // ── Sync bookkeeping ───────────────────────────────────────────────────────
  // `sync_meta` is a tiny key/value store (active tenant id, last_pulled_at).
  `CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );`,
  // `pending_deletes` logs hard-deleted rows so the next push removes them from
  // Supabase (a deleted row has no _dirty flag left to push).
  `CREATE TABLE IF NOT EXISTS pending_deletes (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    PRIMARY KEY (table_name, row_id)
  );`,
];

// ── Read-path indices ────────────────────────────────────────────────────────
export const CREATE_INDEX_STATEMENTS: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);`,
  `CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);`,
  `CREATE INDEX IF NOT EXISTS idx_customer_plans_customer ON customer_plans(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_customer_plans_active ON customer_plans(active);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_line ON payments(customer_plan_id);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_month ON payments(billing_month);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_paidat ON payments(paid_at);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_soldat ON sales(sold_at);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_custom_debts_customer ON custom_debts(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_debt_payments_customer ON debt_payments(customer_id);`,
  // Date-ranged reads: the reports scan a whole period per money stream, and
  // the derived stock-cost half of expenses scans occurred_at.
  `CREATE INDEX IF NOT EXISTS idx_debt_payments_paidat ON debt_payments(paid_at);`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_incurred ON expenses(incurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_occurred ON stock_movements(occurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_sale ON stock_movements(sale_id);`,
  // Audit trail: the list is ordered by occurred_at, the History sheet filters
  // by (table, record), and the prune scans occurred_at.
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred ON audit_logs(occurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(table_name, record_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);`,
];
