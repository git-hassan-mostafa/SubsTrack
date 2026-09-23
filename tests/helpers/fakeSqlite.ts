import { TABLE_BY_NAME } from "@/src/core/offline/db/tables";

/**
 * An in-memory stand-in for the ONE SQLite connection expo-sqlite hands the app.
 * It parses only the statement shapes `db/dml.ts` and the sync engine actually
 * emit, and it enforces the two things a money merge depends on: the PRIMARY KEY
 * on `id`, and the UNIQUE index behind each table's natural key. It implements no
 * money rule and no merge policy — those stay in the code under test.
 */

type Row = Record<string, unknown>;

const NATURAL_KEYS: Record<string, string[]> = {
  charges: ["customer_plan_id", "billing_month"],
  skipped_months: ["customer_plan_id", "billing_month"],
  tenant_settings: ["tenant_id", "key"],
  collection_items: ["collection_id", "charge_id"],
};

export class UniqueViolation extends Error {
  constructor(table: string, key: string[]) {
    super(`UNIQUE constraint failed: ${table}(${key.join(", ")})`);
  }
}

function keyOf(key: string[], row: Row): string {
  return key.map((c) => String(row[c])).join("\u0000");
}

export class FakeDb {
  private tables = new Map<string, Row[]>();
  readonly statements: string[] = [];

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.tables.set(
        table,
        rows.map((r) => ({ ...r })),
      );
    }
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  /** Every table that currently holds rows. */
  names(): string[] {
    return [...this.tables.keys()];
  }

  /** Drop one table's rows, the way `DELETE FROM <t>;` does. */
  clear(table: string): void {
    this.tables.set(table, []);
  }

  private table(name: string): Row[] {
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = []));
    return t;
  }

  private assertUnique(table: string, rows: Row[]): void {
    const key = NATURAL_KEYS[table];
    if (!key) return;
    const seen = new Set<string>();
    for (const r of rows) {
      if (key.some((c) => r[c] === null || r[c] === undefined)) continue;
      const k = keyOf(key, r);
      if (seen.has(k)) throw new UniqueViolation(table, key);
      seen.add(k);
    }
  }

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    const snapshot = new Map(
      [...this.tables].map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]),
    );
    try {
      await fn();
    } catch (e) {
      this.tables = snapshot;
      throw e;
    }
  }

  async getFirstAsync<T>(sql: string, args: unknown[] = []): Promise<T | null> {
    const all = await this.getAllAsync<T>(sql, args);
    return all[0] ?? null;
  }

  async getAllAsync<T>(sql: string, args: unknown[] = []): Promise<T[]> {
    this.statements.push(sql);
    const from = /FROM\s+(\w+)/i.exec(sql);
    if (!from) throw new Error(`fake-sqlite: cannot parse SELECT: ${sql}`);
    const table = from[1];
    if (table === "sync_meta") {
      const hit = this.rows("sync_meta").find((r) => r.key === args[0]);
      return (hit ? [hit] : []) as T[];
    }

    let rows = this.rows(table);
    if (/_dirty\s*=\s*1/.test(sql)) rows = rows.filter((r) => r._dirty === 1);
    if (/_dirty\s*=\s*0/.test(sql)) rows = rows.filter((r) => r._dirty === 0);

    if (/id IN \(/i.test(sql)) {
      const ids = new Set(args.map(String));
      rows = rows.filter((r) => ids.has(String(r.id)));
    }

    const tuple = /WHERE \(([\w,\s]+)\) IN \(VALUES/i.exec(sql);
    if (tuple) {
      const key = tuple[1].split(",").map((c) => c.trim());
      const wanted = new Set<string>();
      for (let i = 0; i < args.length; i += key.length) {
        wanted.add(args.slice(i, i + key.length).map(String).join("\u0000"));
      }
      rows = rows.filter((r) => wanted.has(keyOf(key, r)));
    }

    const counted = /^\s*SELECT\s+COUNT\(\*\)\s+AS\s+(\w+)/i.exec(sql);
    const eq = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
    const positional = eq.filter((c) => c !== "_dirty");
    if (positional.length > 0 && !tuple && !/id IN \(/i.test(sql)) {
      rows = rows.filter((r) =>
        positional.every((c, i) => String(r[c]) === String(args[i])),
      );
    }
    if (counted) return [{ [counted[1]]: rows.length }] as T[];
    return rows.map((r) => ({ ...r })) as T[];
  }

  async runAsync(sql: string, args: unknown[] = []): Promise<void> {
    this.statements.push(sql);

    const del = /^\s*DELETE FROM\s+(\w+)/i.exec(sql);
    if (del) return this.runDelete(del[1], sql, args);

    const upd = /^\s*UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE/i.exec(sql);
    if (upd) return this.runUpdate(upd[1], upd[2], sql, args);

    const ins = /^\s*INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)/i.exec(
      sql,
    );
    if (ins) return this.runInsert(ins[1], ins[2], sql, args);

    throw new Error(`fake-sqlite: cannot parse statement: ${sql}`);
  }

  private runDelete(table: string, sql: string, args: unknown[]): void {
    const rows = this.table(table);
    if (table === "sync_meta") {
      const i = rows.findIndex((r) => r.key === args[0]);
      if (i >= 0) rows.splice(i, 1);
      return;
    }
    if (/table_name = \?/.test(sql)) {
      const [name, ...ids] = args.map(String);
      const keep = rows.filter(
        (r) => !(r.table_name === name && ids.includes(String(r.row_id))),
      );
      this.tables.set(table, keep);
      return;
    }
    const cleanOnly = /_dirty\s*=\s*0/.test(sql);
    if (/occurred_at < \?/.test(sql)) {
      const cut = String(args[0]);
      const keep = rows.filter(
        (r) =>
          !(String(r.occurred_at) < cut && (!cleanOnly || r._dirty === 0)),
      );
      this.tables.set(table, keep);
      return;
    }
    const ids = new Set(args.map(String));
    const keep = rows.filter(
      (r) => !(ids.has(String(r.id)) && (!cleanOnly || r._dirty === 0)),
    );
    this.tables.set(table, keep);
  }

  private runUpdate(
    table: string,
    setClause: string,
    sql: string,
    args: unknown[],
  ): void {
    const cols = [...setClause.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
    const dirty = /_dirty\s*=\s*(\d)/.exec(setClause);
    const rows = this.table(table);
    const targets = /id IN \(/i.test(sql)
      ? (() => {
          const ids = new Set(args.slice(cols.length).map(String));
          return rows.filter((r) => ids.has(String(r.id)));
        })()
      : rows.filter((r) => String(r.id) === String(args[cols.length]));

    for (const r of targets) {
      cols.forEach((c, i) => {
        r[c] = args[i];
      });
      if (dirty) r._dirty = Number(dirty[1]);
    }
  }

  private runInsert(
    table: string,
    colList: string,
    sql: string,
    args: unknown[],
  ): void {
    const cols = colList.split(",").map((c) => c.trim());
    const rows = this.table(table);

    if (table === "sync_meta") {
      const hit = rows.find((r) => r.key === args[0]);
      if (hit) hit.value = args[1];
      else rows.push({ key: args[0], value: args[1] });
      return;
    }
    if (table === "pending_deletes") {
      const exists = rows.some(
        (r) =>
          String(r.table_name) === String(args[0]) &&
          String(r.row_id) === String(args[1]),
      );
      if (!exists) rows.push({ table_name: args[0], row_id: args[1] });
      return;
    }

    const upsert = /ON CONFLICT \(id\) DO UPDATE/i.test(sql);
    const incoming: Row[] = [];
    for (let i = 0; i < args.length; i += cols.length) {
      const row: Row = {};
      cols.forEach((c, j) => {
        row[c] = args[i + j];
      });
      incoming.push(row);
    }

    const next = rows.map((r) => ({ ...r }));
    for (const row of incoming) {
      const at = next.findIndex((r) => String(r.id) === String(row.id));
      if (at >= 0) {
        if (!upsert) throw new Error(`UNIQUE constraint failed: ${table}.id`);
        next[at] = { ...next[at], ...row };
      } else {
        next.push(row);
      }
    }
    this.assertUnique(table, next);
    this.tables.set(table, next);
  }
}

/** A clean mirror row for `table`, defaulted from its real column spec. */
export function mirrorRow(
  table: string,
  over: Row = {},
  dirty: 0 | 1 = 0,
): Row {
  const spec = TABLE_BY_NAME[table];
  if (!spec) throw new Error(`unknown table: ${table}`);
  const row: Row = {};
  for (const col of Object.keys(spec.columns)) row[col] = null;
  return { ...row, ...over, _dirty: dirty };
}
