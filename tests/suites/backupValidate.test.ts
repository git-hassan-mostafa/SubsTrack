import { TABLES } from "@/src/core/offline/db/tables";
import { validateBackup } from "@/src/core/offline/backup/validate";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupRow,
  type BackupSession,
} from "@/src/core/offline/backup/types";

const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";
const USER = "user-1";
const BRANCH = "branch-1";

const session: BackupSession = {
  tenantId: TENANT,
  tenantCode: "ACME",
  tenantName: "Acme ISP",
  userId: USER,
  username: "hassan",
  branchId: null,
  role: "admin",
};

function emptyTables(): Record<string, BackupRow[]> {
  return Object.fromEntries(TABLES.map((t) => [t.name, [] as BackupRow[]]));
}

function makeFile(
  overrides: Record<string, BackupRow[]> = {},
  extra: Record<string, unknown> = {},
) {
  const tables = { ...emptyTables(), ...overrides };
  if (!overrides.tenants) tables.tenants = [{ id: TENANT, name: "Acme ISP" }];
  if (!overrides.users) {
    tables.users = [{ id: USER, tenant_id: TENANT, username: "hassan" }];
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-09-18T10:00:00.000Z",
    app: { version: "1.0.0", runtimeVersion: null },
    tenant: { id: TENANT, code: "ACME", name: "Acme ISP" },
    branchScope: "__all__",
    user: { id: USER, username: "hassan" },
    counts: {},
    tables,
    ...extra,
  };
}

function problemOf(file: unknown, s: BackupSession = session) {
  const result = validateBackup(file, s);
  if (result.ok) throw new Error("expected a refusal, got ok");
  return result.problem;
}

describe("TC-BK-01 a clean same-tenant backup is accepted", () => {
  it("accepts and counts the rows", () => {
    const file = makeFile({
      customers: [
        { id: "c1", tenant_id: TENANT, name: "Ali" },
        { id: "c2", tenant_id: TENANT, name: "Sara" },
      ],
    });
    const result = validateBackup(file, session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalRows).toBe(4);
    expect(result.backup.counts.customers).toBe(2);
    expect(result.warnings).toEqual([]);
  });
});

describe("TC-BK-02 the tenant guard", () => {
  it("refuses a file whose envelope names another organization", () => {
    const file = makeFile(
      {},
      { tenant: { id: OTHER_TENANT, code: "X", name: "Other Co" } },
    );
    expect(problemOf(file)).toMatchObject({
      code: "wrong_tenant",
      value: "Other Co",
    });
  });

  it("refuses when the envelope is right but ONE row carries another tenant", () => {
    const file = makeFile({
      customers: [
        { id: "c1", tenant_id: TENANT, name: "Ali" },
        { id: "c2", tenant_id: OTHER_TENANT, name: "Smuggled" },
      ],
    });
    expect(problemOf(file)).toMatchObject({
      code: "wrong_tenant_rows",
      table: "customers",
    });
  });

  it("refuses two tenants rows", () => {
    const file = makeFile({
      tenants: [{ id: TENANT }, { id: OTHER_TENANT }],
    });
    expect(problemOf(file).code).toBe("wrong_tenant_rows");
  });

  it("exempts the global app_options table from the tenant rule", () => {
    const file = makeFile({
      app_options: [{ id: "o1", key: "LiraRate", value: "90000" }],
    });
    expect(validateBackup(file, session).ok).toBe(true);
  });
});

describe("TC-BK-03 the branch-scope guard", () => {
  it("refuses a tenant-wide file on a branch-scoped phone", () => {
    const branchSession: BackupSession = { ...session, branchId: BRANCH };
    const file = makeFile({
      branches: [{ id: BRANCH, tenant_id: TENANT, name: "Main" }],
    });
    expect(problemOf(file, branchSession)).toMatchObject({
      code: "wrong_branch",
      value: "__all__",
    });
  });

  it("accepts a matching branch scope", () => {
    const branchSession: BackupSession = { ...session, branchId: BRANCH };
    const file = makeFile(
      { branches: [{ id: BRANCH, tenant_id: TENANT, name: "Main" }] },
      { branchScope: BRANCH },
    );
    expect(validateBackup(file, branchSession).ok).toBe(true);
  });
});

describe("TC-BK-04 the lock-out guard", () => {
  it("refuses a file without the importing user own row", () => {
    const file = makeFile({
      users: [{ id: "someone-else", tenant_id: TENANT, username: "other" }],
    });
    expect(problemOf(file)).toMatchObject({
      code: "missing_profile",
      table: "users",
    });
  });

  it("refuses a branch-scoped session whose branch row is absent", () => {
    const branchSession: BackupSession = { ...session, branchId: BRANCH };
    const file = makeFile({}, { branchScope: BRANCH });
    expect(problemOf(file, branchSession)).toMatchObject({
      code: "missing_profile",
      table: "branches",
    });
  });
});

describe("TC-BK-05 rows that would abort the restore transaction", () => {
  it("refuses a duplicate id inside one table", () => {
    const file = makeFile({
      customers: [
        { id: "c1", tenant_id: TENANT, name: "Ali" },
        { id: "c1", tenant_id: TENANT, name: "Ali again" },
      ],
    });
    expect(problemOf(file)).toMatchObject({
      code: "duplicate_id",
      table: "customers",
      value: "c1",
    });
  });

  it("refuses two charges sharing one line and month", () => {
    const row = (id: string): BackupRow => ({
      id,
      tenant_id: TENANT,
      customer_plan_id: "line-1",
      billing_month: "2026-09-01",
    });
    const file = makeFile({ charges: [row("ch1"), row("ch2")] });
    expect(problemOf(file)).toMatchObject({
      code: "duplicate_key",
      table: "charges",
    });
  });

  it("allows two charges whose natural key is null (a sale bill)", () => {
    const row = (id: string): BackupRow => ({
      id,
      tenant_id: TENANT,
      customer_plan_id: null,
      billing_month: null,
    });
    const file = makeFile({ charges: [row("ch1"), row("ch2")] });
    expect(validateBackup(file, session).ok).toBe(true);
  });

  it("refuses a row with no id", () => {
    const file = makeFile({ customers: [{ tenant_id: TENANT, name: "Ali" }] });
    expect(problemOf(file)).toMatchObject({
      code: "missing_id",
      table: "customers",
    });
  });
});

describe("TC-BK-06 file shape", () => {
  it("refuses a file that is not a SubsTrack backup", () => {
    expect(problemOf({ format: "something-else", version: 1 }).code).toBe(
      "wrong_format",
    );
  });

  it("refuses a newer format version", () => {
    expect(problemOf(makeFile({}, { version: BACKUP_VERSION + 1 })).code).toBe(
      "newer_version",
    );
  });

  it("refuses a missing table rather than silently leaving it alone", () => {
    const file = makeFile();
    delete (file.tables as Record<string, unknown>).expenses;
    expect(problemOf(file)).toMatchObject({
      code: "missing_table",
      table: "expenses",
    });
  });

  it("refuses an unknown table key", () => {
    const file = makeFile();
    (file.tables as Record<string, unknown>).secrets = [];
    expect(problemOf(file)).toMatchObject({
      code: "unknown_table",
      table: "secrets",
    });
  });

  it("refuses a nested object as a column value", () => {
    const file = makeFile({
      customers: [
        {
          id: "c1",
          tenant_id: TENANT,
          name: { evil: true },
        } as unknown as BackupRow,
      ],
    });
    expect(problemOf(file)).toMatchObject({
      code: "bad_value",
      table: "customers",
      column: "name",
    });
  });

  it("refuses a file that carries the _dirty upload flag", () => {
    const file = makeFile({
      customers: [{ id: "c1", tenant_id: TENANT, name: "Ali", _dirty: 1 }],
    });
    expect(problemOf(file)).toMatchObject({
      code: "carries_dirty",
      table: "customers",
    });
  });

  it("drops an unknown column and warns instead of failing", () => {
    const file = makeFile({
      customers: [
        { id: "c1", tenant_id: TENANT, name: "Ali", legacy_column: "x" },
      ],
    });
    const result = validateBackup(file, session);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([
      { table: "customers", columns: ["legacy_column"] },
    ]);
    expect(result.backup.tables.customers[0]).not.toHaveProperty(
      "legacy_column",
    );
  });
});
