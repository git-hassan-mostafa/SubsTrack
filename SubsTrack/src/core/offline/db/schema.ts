import { TABLES, type ColType, type TableSpec } from "./tables";

const SQL_TYPE: Record<ColType, string> = {
  text: "TEXT",
  int: "INTEGER",
  num: "TEXT",
  bool: "INTEGER",
  json: "TEXT",
};

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

export const CREATE_TABLE_STATEMENTS: string[] = [
  ...TABLES.map(createTableSql),

  `CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS pending_deletes (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    PRIMARY KEY (table_name, row_id)
  );`,
];

export const CREATE_INDEX_STATEMENTS: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);`,
  `CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);`,
  `CREATE INDEX IF NOT EXISTS idx_customer_plans_customer ON customer_plans(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_customer_plans_active ON customer_plans(active);`,
  `CREATE INDEX IF NOT EXISTS idx_charges_customer ON charges(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_charges_line ON charges(customer_plan_id);`,
  `CREATE INDEX IF NOT EXISTS idx_charges_month ON charges(billing_month);`,
  `CREATE INDEX IF NOT EXISTS idx_charges_due ON charges(due_date);`,
  `CREATE INDEX IF NOT EXISTS idx_charges_sale ON charges(sale_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_soldat ON sales(sold_at);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_service ON sale_items(service_id);`,
  `CREATE INDEX IF NOT EXISTS idx_skipped_months_customer ON skipped_months(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_collections_customer ON collections(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_collections_holder ON collections(held_by_user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_collection_items_charge ON collection_items(charge_id);`,
  `CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id);`,
  `CREATE INDEX IF NOT EXISTS idx_collections_received ON collections(received_at);`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_incurred ON expenses(incurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_occurred ON stock_movements(occurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_sale ON stock_movements(sale_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred ON audit_logs(occurred_at);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(table_name, record_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);`,

  ...TABLES.filter((t) => t.scope === "tenant").map(
    (t) =>
      `CREATE INDEX IF NOT EXISTS idx_${t.name}_dirty ON ${t.name}(_dirty) WHERE _dirty = 1;`,
  ),
];
