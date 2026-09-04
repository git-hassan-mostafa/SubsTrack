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
    case 'json':
      if (typeof v !== 'string') return v;
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
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
      return String(v);
    case 'int':
      return typeof v === 'number' ? v : Number(v);
    case 'json':
      return typeof v === 'string' ? v : JSON.stringify(v);
    default:
      return v;
  }
}

/**
 * Decode a raw SQLite row into the snake_case `Db*` shape the services' mappers
 * expect (0/1 → boolean, TEXT-decimal → number). Returns only the spec columns
 * (drops the local-only `_dirty` flag).
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

/**
 * Encode many rows against ONE shared column list — what a multi-row INSERT
 * needs. The columns come from the FIRST row (intersected with the spec), not
 * from the union of all rows: every row of a pulled page is one `select *` from
 * the same table, so they all carry the same keys, and taking the spec's full
 * list instead would bind NULL over a local value whenever the server has not
 * grown a column yet.
 */
export function encodeRowsUniform(
  table: string,
  rows: object[],
): { columns: string[]; values: unknown[][] } {
  const spec = TABLE_BY_NAME[table];
  if (!spec) throw new Error(`[offline] unknown table: ${table}`);
  const first = rows[0] as Record<string, unknown>;
  const cols = Object.entries(spec.columns).filter(([col]) => col in first);
  return {
    columns: cols.map(([col]) => col),
    values: rows.map((row) => {
      const r = row as Record<string, unknown>;
      return cols.map(([col, type]) => encodeValue(r[col], type));
    }),
  };
}
