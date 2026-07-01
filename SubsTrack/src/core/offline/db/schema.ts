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

// Each entry is one schema version. Append a new array to migrate forward.
export const MIGRATIONS: string[][] = [SCHEMA_V1];
