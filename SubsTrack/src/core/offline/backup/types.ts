export const BACKUP_FORMAT = "substrack-local-backup";
export const BACKUP_VERSION = 1;

export type BackupRow = Record<string, string | number | boolean | null>;

/** One exported mirror — `sync_meta` and `pending_deletes` are left out. */
export interface LocalBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: { version: string | null; runtimeVersion: string | null };
  tenant: { id: string; code: string; name: string };
  branchScope: string;
  user: { id: string; username: string };
  counts: Record<string, number>;
  tables: Record<string, BackupRow[]>;
}

/** Who is importing — read at confirm time, never at screen mount. */
export interface BackupSession {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  userId: string;
  username: string;
  branchId: string | null;
}

export type BackupProblemCode =
  | "invalid_file"
  | "wrong_format"
  | "newer_version"
  | "missing_table"
  | "unknown_table"
  | "bad_value"
  | "carries_dirty"
  | "missing_id"
  | "duplicate_id"
  | "duplicate_key"
  | "wrong_tenant"
  | "wrong_tenant_rows"
  | "wrong_branch"
  | "missing_profile";

export interface BackupProblem {
  code: BackupProblemCode;
  table?: string;
  column?: string;
  value?: string;
}

export interface BackupWarning {
  table: string;
  columns: string[];
}

export type BackupCheck =
  | {
      ok: true;
      backup: LocalBackup;
      totalRows: number;
      warnings: BackupWarning[];
    }
  | { ok: false; problem: BackupProblem };

export interface RestoreOptions {
  pushToServer: boolean;
}
