import { inBatches } from "../batch";
import { withDbLock } from "../dbLock";
import { getDb } from "../db/sqlite";
import { TABLE_BY_NAME } from "../db/tables";
import { hasUnsyncedWrites } from "../bootstrap/tenant";
import {
  META_ACTIVE_BRANCH_SCOPE,
  META_ACTIVE_ROLE_SCOPE,
  META_ACTIVE_TENANT,
  setMeta,
} from "../sync/meta";
import { BACKUP_TABLE_ORDER, rowsPerStatement } from "./tableOrder";
import { roleScopeOf, scopeKeyOf } from "../scope";
import type {
  BackupRow,
  BackupSession,
  LocalBackup,
  RestoreOptions,
} from "./types";

// never dirty — the server refuses these and wedges the push, gotcha #150
const NEVER_PUSHED = new Set([
  "tenants",
  "app_options",
  "users",
  "audit_logs",
  "exception_logs",
]);

export class RestoreBlockedError extends Error {
  readonly code = "RESTORE_BLOCKED";
  constructor() {
    super("restore_blocked_unsynced");
    this.name = "RestoreBlockedError";
  }
}

function insertBatch(
  table: string,
  columns: readonly string[],
  rows: readonly BackupRow[],
  dirty: 0 | 1,
): { sql: string; values: unknown[] } {
  const placeholders = `(${columns.map(() => "?").join(", ")}, ?)`;
  const values: unknown[] = [];
  for (const row of rows) {
    for (const column of columns) {
      const value = row[column];
      values.push(value === undefined ? null : value);
    }
    values.push(dirty);
  }
  const sql = `INSERT INTO ${table} (${columns.join(", ")}, _dirty) VALUES ${rows
    .map(() => placeholders)
    .join(", ")}`;
  return { sql, values };
}

/** One transaction; columns come from the live spec, never from the file. */
export async function restoreBackup(
  backup: LocalBackup,
  session: BackupSession,
  options: RestoreOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const db = getDb();
  const total = BACKUP_TABLE_ORDER.reduce(
    (sum, name) => sum + (backup.tables[name]?.length ?? 0),
    0,
  );

  await withDbLock(async () => {
    if (await hasUnsyncedWrites(db)) throw new RestoreBlockedError();

    await db.withTransactionAsync(async () => {
      for (const name of [...BACKUP_TABLE_ORDER].reverse()) {
        await db.execAsync(`DELETE FROM ${name};`);
      }
      await db.execAsync("DELETE FROM pending_deletes;");

      let done = 0;
      for (const name of BACKUP_TABLE_ORDER) {
        const rows = backup.tables[name] ?? [];
        if (rows.length === 0) continue;
        const columns = Object.keys(TABLE_BY_NAME[name].columns);
        const dirty: 0 | 1 =
          options.pushToServer && !NEVER_PUSHED.has(name) ? 1 : 0;

        for (const chunk of inBatches(rows, rowsPerStatement(columns.length))) {
          const { sql, values } = insertBatch(name, columns, chunk, dirty);
          await db.runAsync(sql, values as never[]);
          done += chunk.length;
          onProgress?.(done, total);
        }
      }

      await setMeta(db, META_ACTIVE_TENANT, session.tenantId);
      await setMeta(db, META_ACTIVE_BRANCH_SCOPE, scopeKeyOf(session.branchId));
      await setMeta(db, META_ACTIVE_ROLE_SCOPE, roleScopeOf(session.role));
      await db.execAsync(
        "DELETE FROM sync_meta WHERE key IN ('last_pulled_at', 'last_sync_at');",
      );
    });
  });
}
