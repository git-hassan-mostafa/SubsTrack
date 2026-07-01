import { TABLE_BY_NAME, type ColType } from './tables';

type RawRow = Record<string, unknown>;

function decodeValue(v: unknown, type: ColType): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'bool':
      return v === 1 || v === '1' || v === true;
    case 'int':
    case 'num':
      return Number(v);
    default:
      return v as string;
  }
}

function encodeValue(v: unknown, type: ColType): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'bool':
      return v ? 1 : 0;
    case 'num':
      return String(v); // exact decimal text — no SQLite REAL float drift
    case 'int':
      return typeof v === 'number' ? v : Number(v);
    default:
      return v;
  }
}

/**
 * Decode a raw SQLite row into the snake_case `Db*` shape the services' mappers
 * expect (0/1 → boolean, TEXT-decimal → number). Returns only the spec columns
 * (drops local-only `_dirty` / `_server_updated_at`).
 */
export function decodeRow<T = Record<string, unknown>>(table: string, raw: RawRow): T {
  const spec = TABLE_BY_NAME[table];
  if (!spec) throw new Error(`[offline] unknown table: ${table}`);
  const out: Record<string, unknown> = {};
  for (const [col, type] of Object.entries(spec.columns)) {
    out[col] = decodeValue(raw[col], type);
  }
  return out as T;
}

export function decodeRows<T = Record<string, unknown>>(table: string, rows: RawRow[]): T[] {
  return rows.map((r) => decodeRow<T>(table, r));
}

/**
 * Encode a (partial) `Db*` row into `{ columns, values }` for binding. Only
 * columns present in `row` AND known to the table spec are included.
 */
export function encodeRow(
  table: string,
  row: object,
): { columns: string[]; values: unknown[] } {
  const spec = TABLE_BY_NAME[table];
  if (!spec) throw new Error(`[offline] unknown table: ${table}`);
  const r = row as Record<string, unknown>;
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [col, type] of Object.entries(spec.columns)) {
    if (col in r) {
      columns.push(col);
      values.push(encodeValue(r[col], type));
    }
  }
  return { columns, values };
}
