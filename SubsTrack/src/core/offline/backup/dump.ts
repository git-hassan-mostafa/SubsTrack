import { withDbLock } from "../dbLock";
import { getDb } from "../db/sqlite";
import { TABLE_BY_NAME } from "../db/tables";
import { BACKUP_TABLE_ORDER } from "./tableOrder";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupSession,
} from "./types";

export interface BackupSink {
  write: (chunk: string) => void;
}

export interface DumpResult {
  counts: Record<string, number>;
  totalRows: number;
}

/** Every un-pushed local write, the thing an export must refuse to snapshot. */
export async function countUnsyncedWrites(): Promise<number> {
  const db = getDb();
  return withDbLock(async () => {
    let total = 0;
    const deletes = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM pending_deletes",
    );
    total += deletes?.n ?? 0;
    for (const name of BACKUP_TABLE_ORDER) {
      const spec = TABLE_BY_NAME[name];
      if (spec.scope !== "tenant" || spec.appendOnly) continue;
      const row = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${name} WHERE _dirty = 1`,
      );
      total += row?.n ?? 0;
    }
    return total;
  });
}

function rowJson(
  raw: Record<string, unknown>,
  columns: readonly string[],
): string {
  const out: Record<string, unknown> = {};
  for (const column of columns) {
    const value = raw[column];
    out[column] = value === undefined ? null : value;
  }
  return JSON.stringify(out);
}

/** Streams row by row — one JSON.stringify of the whole mirror is an OOM kill. */
export async function writeBackup(
  sink: BackupSink,
  session: BackupSession,
  app: { version: string | null; runtimeVersion: string | null },
  branchScope: string,
  onProgress?: (done: number) => void,
): Promise<DumpResult> {
  const db = getDb();
  return withDbLock(async () => {
    const counts: Record<string, number> = {};
    let totalRows = 0;

    const header = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      app,
      tenant: {
        id: session.tenantId,
        code: session.tenantCode,
        name: session.tenantName,
      },
      branchScope,
      user: { id: session.userId, username: session.username },
    };
    const headerJson = JSON.stringify(header);
    sink.write(headerJson.slice(0, headerJson.length - 1) + ',"tables":{');

    let firstTable = true;
    for (const name of BACKUP_TABLE_ORDER) {
      const columns = Object.keys(TABLE_BY_NAME[name].columns);
      sink.write(`${firstTable ? "" : ","}${JSON.stringify(name)}:[`);
      firstTable = false;

      let rows = 0;
      for await (const raw of db.getEachAsync<Record<string, unknown>>(
        `SELECT * FROM ${name}`,
      )) {
        sink.write((rows === 0 ? "" : ",") + rowJson(raw, columns));
        rows += 1;
        totalRows += 1;
        if (totalRows % 2000 === 0) onProgress?.(totalRows);
      }
      sink.write("]");
      counts[name] = rows;
    }

    sink.write("}}");
    onProgress?.(totalRows);
    return { counts, totalRows };
  });
}
