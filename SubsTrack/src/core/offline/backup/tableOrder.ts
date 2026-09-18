import { SYNC_TABLES, TABLES } from "../db/tables";

/** Parents before children — the push's own wave order. */
export const BACKUP_TABLE_ORDER: readonly string[] = [
  ...SYNC_TABLES.filter((name) => TABLES.some((t) => t.name === name)),
  ...TABLES.map((t) => t.name).filter((name) => !SYNC_TABLES.includes(name)),
];

const MAX_BOUND_PARAMS = 900;

/** Rows per INSERT, under SQLite's oldest bound-parameter ceiling. */
export function rowsPerStatement(columnCount: number): number {
  return Math.max(1, Math.floor(MAX_BOUND_PARAMS / (columnCount + 1)));
}
