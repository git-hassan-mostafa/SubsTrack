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
  // Local-only sync metadata (stripped before push). `_dirty` = 1 while a local
  // change awaits push; `_server_updated_at` = last server updated_at seen (LWW +
  // pull-cursor key, kept distinct from the user-visible updated_at).
  cols.push('_dirty INTEGER NOT NULL DEFAULT 0', '_server_updated_at TEXT');
  const body = [...cols, ...(t.constraints ?? [])].join(',\n  ');
  return `CREATE TABLE IF NOT EXISTS ${t.name} (\n  ${body}\n);`;
}

// Note: the local mirror does NOT declare SQL foreign keys. Rows arrive out of
// order during pull, and cross-device cascade deletes are handled by tombstones
// — FK enforcement would wrongly reject those. So `PRAGMA foreign_keys` stays off.
export const SCHEMA_V1: string[] = [
  ...TABLES.map(createTableSql),

  // ── Durable outbox (one row per local mutation) ────────────────────────────
  `CREATE TABLE IF NOT EXISTS outbox (
    op_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    op_type TEXT NOT NULL,
    row_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    base_version TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_error TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_status_seq ON outbox(status, op_seq);`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_row ON outbox(table_name, row_id);`,

  // ── Pull bookkeeping ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sync_cursors (
    table_name TEXT PRIMARY KEY NOT NULL,
    last_pulled_at TEXT,
    last_full_sync_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
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
];

// ── V2: Debts feature ────────────────────────────────────────────────────────
// Delta applied to EXISTING installs only (fresh installs get everything from
// SCHEMA_V1, which is regenerated from the current TABLES — see runMigrations).
// Adds the two debt tables + the sales.amount_paid column (legacy sales backfill
// to full = paid, so they don't show a phantom debt).
const debtTables = TABLES.filter(
  (t) => t.name === 'custom_debts' || t.name === 'debt_payments',
);
export const SCHEMA_V2: string[] = [
  ...debtTables.map(createTableSql),
  `CREATE INDEX IF NOT EXISTS idx_custom_debts_customer ON custom_debts(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_debt_payments_customer ON debt_payments(customer_id);`,
  // SQLite has no `ADD COLUMN IF NOT EXISTS`; this runs on existing installs only.
  `ALTER TABLE sales ADD COLUMN amount_paid TEXT;`,
  `UPDATE sales SET amount_paid = total_amount WHERE amount_paid IS NULL;`,
];

// Each entry is one schema version. Append a new array to migrate forward.
// IMPORTANT: deltas must be purely additive DDL already reflected in the
// TABLES-generated SCHEMA_V1 (fresh installs skip deltas — see runMigrations).
export const MIGRATIONS: string[][] = [SCHEMA_V1, SCHEMA_V2];
