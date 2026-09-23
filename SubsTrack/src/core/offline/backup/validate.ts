import { TABLES, TABLE_BY_NAME } from "../db/tables";
import { scopeKeyOf } from "../scope";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupCheck,
  type BackupProblem,
  type BackupProblemCode,
  type BackupRow,
  type BackupSession,
  type BackupWarning,
  type LocalBackup,
} from "./types";

const NATURAL_KEYS: Record<string, string[]> = {
  charges: ["customer_plan_id", "billing_month"],
  skipped_months: ["customer_plan_id", "billing_month"],
  collection_items: ["collection_id", "charge_id"],
};

function fail(
  code: BackupProblemCode,
  extra?: Omit<BackupProblem, "code">,
): BackupCheck {
  return { ok: false, problem: { code, ...extra } };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBindable(v: unknown): v is string | number | boolean | null {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

/** Every refusal that needs no database, ordered clearest-first. Pure. */
export function validateBackup(
  parsed: unknown,
  session: BackupSession,
): BackupCheck {
  if (!isPlainObject(parsed)) return fail("invalid_file");
  if (parsed.format !== BACKUP_FORMAT) return fail("wrong_format");
  if (typeof parsed.version !== "number") return fail("invalid_file");
  if (parsed.version > BACKUP_VERSION) return fail("newer_version");

  const tenant = parsed.tenant;
  const user = parsed.user;
  if (!isPlainObject(tenant) || typeof tenant.id !== "string") {
    return fail("invalid_file");
  }
  if (!isPlainObject(user) || typeof user.id !== "string") {
    return fail("invalid_file");
  }
  if (typeof parsed.branchScope !== "string") return fail("invalid_file");
  if (!isPlainObject(parsed.tables)) return fail("invalid_file");

  const tables = parsed.tables;
  for (const key of Object.keys(tables)) {
    if (!TABLE_BY_NAME[key]) return fail("unknown_table", { table: key });
  }

  const warnings: BackupWarning[] = [];
  const clean: Record<string, BackupRow[]> = {};
  let totalRows = 0;

  for (const spec of TABLES) {
    const raw = tables[spec.name];
    if (!Array.isArray(raw)) return fail("missing_table", { table: spec.name });

    const columns = new Set(Object.keys(spec.columns));
    const dropped = new Set<string>();
    const seenIds = new Set<string>();
    const naturalKey = NATURAL_KEYS[spec.name];
    const seenKeys = new Set<string>();
    const rows: BackupRow[] = [];

    for (const entry of raw) {
      if (!isPlainObject(entry))
        return fail("invalid_file", { table: spec.name });

      const row: BackupRow = {};
      for (const [column, value] of Object.entries(entry)) {
        if (column === "_dirty") {
          return fail("carries_dirty", { table: spec.name });
        }
        if (!columns.has(column)) {
          dropped.add(column);
          continue;
        }
        if (!isBindable(value)) {
          return fail("bad_value", { table: spec.name, column });
        }
        row[column] = value;
      }

      const id = row.id;
      if (typeof id !== "string" || id.length === 0) {
        return fail("missing_id", { table: spec.name });
      }
      if (seenIds.has(id)) {
        return fail("duplicate_id", { table: spec.name, value: id });
      }
      seenIds.add(id);

      if (naturalKey) {
        const parts = naturalKey.map((c) => row[c]);
        if (parts.every((p) => p !== null && p !== undefined)) {
          const composite = parts.join("\u0000");
          if (seenKeys.has(composite)) {
            return fail("duplicate_key", {
              table: spec.name,
              value: parts.join(" / "),
            });
          }
          seenKeys.add(composite);
        }
      }

      rows.push(row);
    }

    if (dropped.size > 0) {
      warnings.push({ table: spec.name, columns: [...dropped].sort() });
    }
    clean[spec.name] = rows;
    totalRows += rows.length;
  }

  if (tenant.id !== session.tenantId) {
    const name = typeof tenant.name === "string" ? tenant.name : tenant.id;
    return fail("wrong_tenant", { value: name });
  }

  const tenantRows = clean.tenants;
  if (tenantRows.length !== 1 || tenantRows[0].id !== session.tenantId) {
    return fail("wrong_tenant_rows", { table: "tenants" });
  }

  for (const spec of TABLES) {
    if (spec.scope !== "tenant" || spec.name === "tenants") continue;
    for (const row of clean[spec.name]) {
      if (row.tenant_id !== session.tenantId) {
        return fail("wrong_tenant_rows", { table: spec.name });
      }
    }
  }

  if (parsed.branchScope !== scopeKeyOf(session.branchId)) {
    return fail("wrong_branch", { value: parsed.branchScope });
  }

  if (!clean.users.some((row) => row.id === session.userId)) {
    return fail("missing_profile", { table: "users" });
  }
  if (
    session.branchId !== null &&
    !clean.branches.some((row) => row.id === session.branchId)
  ) {
    return fail("missing_profile", { table: "branches" });
  }

  const backup: LocalBackup = {
    format: BACKUP_FORMAT,
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    app: isPlainObject(parsed.app)
      ? {
          version:
            typeof parsed.app.version === "string" ? parsed.app.version : null,
          runtimeVersion:
            typeof parsed.app.runtimeVersion === "string"
              ? parsed.app.runtimeVersion
              : null,
        }
      : { version: null, runtimeVersion: null },
    tenant: {
      id: tenant.id,
      code: typeof tenant.code === "string" ? tenant.code : "",
      name: typeof tenant.name === "string" ? tenant.name : "",
    },
    branchScope: parsed.branchScope,
    user: {
      id: user.id,
      username: typeof user.username === "string" ? user.username : "",
    },
    counts: Object.fromEntries(
      TABLES.map((t) => [t.name, clean[t.name].length]),
    ),
    tables: clean,
  };

  return { ok: true, backup, totalRows, warnings };
}
