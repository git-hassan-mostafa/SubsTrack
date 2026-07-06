import { TABLES, type ColType, type TableSpec } from './tables';

const SQL_TYPE: Record<ColType, string> = {
  text: 'TEXT',
  int: 'INTEGER',
  num: 'TEXT', // numeric/money/rate stored as exact decimal text
  bool: 'INTEGER',
};

function createTableSql(t: TableSpec): string {
  const cols = Object.entries(t.columns).map(([name, type]) =>
    name === 'id' ? 'id TEXT PRIMARY KEY NOT NULL' : `${name} ${SQL_TYPE[type]}`,
  );
  // Local-only sync flag (stripped before push). `_dirty` = 1 while a local
  // change awaits push; the new push scans WHERE _dirty = 1.
  cols.push('_dirty INTEGER NOT NULL DEFAULT 0');
  const body = [...cols, ...(t.constraints ?? [])].join(',\n  ');
  return `CREATE TABLE IF NOT EXISTS ${t.name} (\n  ${body}\n);`;
}

// Note: the local mirror does NOT declare SQL foreign keys. Rows arrive out of
// order during pull, so FK enforcement would wrongly reject them. `PRAGMA
// foreign_keys` stays off.
export const SCHEMA_V1: string[] = [
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

  // ── Read-path indices ──────────────────────────────────────────────────────
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
  `CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);`,
  `CREATE INDEX IF NOT EXISTS idx_custom_debts_customer ON custom_debts(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_debt_payments_customer ON debt_payments(customer_id);`,
];

// Dev-mode only: one version, always run from scratch (clear app data to pick
// up a schema change instead of writing a migration). Append delta arrays here
// once this ships to real users who can't just wipe local data.
export const MIGRATIONS: string[][] = [SCHEMA_V1];
