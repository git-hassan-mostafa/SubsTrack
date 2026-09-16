import i18n from "@/src/core/i18n";
import type { CsvValue } from "@/src/shared/lib/csv";

export type ExportRow = Record<string, unknown>;

// How deep to walk before a nested record is written as its name instead of its
// own columns. Keeps a cyclic or deeply nested object from exploding the sheet.
const MAX_DEPTH = 2;

// The keys worth reading in a single cell when a record has to become one.
const NAME_KEYS = ["name", "label", "code", "title", "fullName", "username"];

/**
 * Is this field worth putting in a spreadsheet? A UUID is not a fact anyone
 * reads, and the tenant is the same on every row. The NAME behind an id is
 * already on the row's nested record, so dropping the id loses nothing —
 * `planId` goes, `plan.name` stays.
 */
export function isReadable(field: string): boolean {
  if (field === "id" || field === "tenantId") return false;
  // "paid" ends in "id" but is not one — only a camelCase boundary marks it.
  return !/[a-z0-9]Ids?$/.test(field);
}

// "createdAt" reads as "Created at". A field nobody has named still exports as
// words rather than a raw key.
function humanize(field: string): string {
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The column title: its translation when there is one, else the field in words. */
export function header(field: string): string {
  const key = `export.col_${field}`;
  const translated = i18n.t(key);
  return translated === key ? humanize(field) : translated;
}

function isRecord(value: unknown): value is ExportRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// What to call a nested record in one cell — its name, else nothing rather than
// [object Object].
function nameOf(row: ExportRow): string {
  for (const key of NAME_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") {
    return i18n.t(value ? "common.yes" : "common.no");
  }
  return String(value);
}

/** One cell's value, keeping a number a number so the sheet can sum it. */
export function cell(value: unknown): CsvValue {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return scalar(value);
}

function walk(value: unknown, prefix: string, out: ExportRow, depth: number): void {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => (isRecord(item) ? nameOf(item) || namesIn(item) : scalar(item)))
      .filter((s) => s !== "");
    if (parts.length > 0) out[prefix] = parts.join(", ");
    return;
  }
  if (isRecord(value)) {
    if (depth >= MAX_DEPTH) {
      const name = nameOf(value);
      if (name) out[prefix] = name;
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (!isReadable(key)) continue;
      walk(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
    return;
  }
  if (value !== null && value !== undefined) out[prefix] = value;
}

// A list item with no name of its own is still worth something if it WRAPS a
// named record — a customer plan has no name, its plan does.
function namesIn(row: ExportRow): string {
  for (const value of Object.values(row)) {
    if (isRecord(value)) {
      const name = nameOf(value);
      if (name) return name;
    }
  }
  return "";
}

/** Flattens one row to its readable leaves: `plan.name` becomes one column. */
export function flattenRow(row: object): ExportRow {
  const out: ExportRow = {};
  walk(row, "", out, 0);
  return out;
}

/**
 * The union of the flattened rows' keys, in first-seen order — a row missing a
 * field the others have must not shift every later cell into the wrong column.
 */
export function fieldsOf(rows: ExportRow[]): string[] {
  const fields: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
    }
  }
  return fields;
}
