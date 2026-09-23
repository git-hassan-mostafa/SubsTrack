import { FakeDb, mirrorRow } from "../helpers/fakeSqlite";
import { FakeSupabase } from "../helpers/fakeSupabase";

// The pull cursor is one shared stamp. Advancing it past a table that FAILED
// hides that table's rows from every future pull — the rows are never re-offered,
// because the next request asks only for `updated_at > cursor`.

const mockServer = new FakeSupabase();
let mockDb = new FakeDb({});

jest.mock("@/src/shared/lib/supabase", () => ({
  supabase: {
    from: (t: string) => mockServer.from(t),
    get auth() {
      return mockServer.auth;
    },
  },
}));

jest.mock("@/src/core/offline/db/sqlite", () => ({
  getDb: () => mockDb,
  isOfflineDbReady: () => true,
}));

jest.mock("@/src/core/offline/dbLock", () => ({
  withDbLock: <T,>(fn: () => Promise<T>) => fn(),
}));

import {
  pruneWindowedTables,
  pullChanges,
  pullFloor,
} from "@/src/core/offline/sync/pull";
import { AUDIT_LOCAL_DAYS } from "@/src/core/offline/db/tables";
import { getMeta, META_LAST_PULLED_AT } from "@/src/core/offline/sync/meta";

const RECONCILED = [
  "customers",
  "plans",
  "branches",
  "currencies",
  "products",
  "services",
];

const cursor = () => getMeta(mockDb as never, META_LAST_PULLED_AT);

/**
 * Answer every reconciled table with its local ids, so the delete-reconcile pass
 * drops nothing. A table the test already stocked keeps what the test gave it.
 */
function keepAll(): void {
  for (const t of RECONCILED) {
    if (mockServer.hasRows(t)) continue;
    mockServer.setRows(
      t,
      mockDb.rows(t).map((r) => ({ id: r.id })),
    );
  }
}

const serverRow = (id: string, updatedAt: string) => ({
  id,
  tenant_id: "t1",
  name: `row-${id}`,
  active: true,
  updated_at: updatedAt,
});

beforeEach(() => {
  mockServer.reset();
  mockDb = new FakeDb({});
});

describe("TC-SY-50..55 — the shared cursor only advances on a COMPLETE cycle", () => {
  it("TC-SY-50 advances to the newest updated_at the pull saw", async () => {
    mockServer.setRows("plans", [
      serverRow("p1", "2026-01-01T00:00:00.000Z"),
      serverRow("p2", "2026-03-05T00:00:00.000Z"),
    ]);
    keepAll();

    await pullChanges();

    expect(await cursor()).toBe("2026-03-05T00:00:00.000Z");
  });

  it("TC-SY-51 HOLDS the cursor when any table failed", async () => {
    mockDb = new FakeDb({
      sync_meta: [
        { key: "last_pulled_at", value: "2026-01-01T00:00:00.000Z" },
      ],
    });
    mockServer.setRows("plans", [serverRow("p1", "2026-03-05T00:00:00.000Z")]);
    mockServer.failTables.add("currencies");
    keepAll();

    const complete = await pullChanges();

    expect(complete).toBe(false);
    expect(await cursor()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("TC-SY-52 reports an incomplete cycle when a delete reconcile fails", async () => {
    mockServer.failTables.add("products");

    await expect(pullChanges()).resolves.toBe(false);
  });

  it("TC-SY-53 asks from a floor a few minutes BEHIND the cursor", async () => {
    mockDb = new FakeDb({
      sync_meta: [{ key: "last_pulled_at", value: "2026-02-01T00:00:00.000Z" }],
    });
    keepAll();

    await pullChanges();

    const plans = mockServer.selects.find((s) => s.table === "plans");
    expect(plans?.gt).toEqual(["updated_at", "2026-01-31T23:55:00.000Z"]);
  });

  it("TC-SY-53b recovers a row stamped before the cursor but committed after", async () => {
    mockDb = new FakeDb({
      sync_meta: [{ key: "last_pulled_at", value: "2026-02-01T00:00:00.000Z" }],
    });
    mockServer.setRows("plans", [serverRow("p1", "2026-01-31T23:57:00.000Z")]);
    keepAll();

    await pullChanges();

    expect(mockDb.rows("plans").map((r) => r.id)).toEqual(["p1"]);
    expect(await cursor()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("TC-SY-53c never drags the cursor backwards onto the floor", async () => {
    mockDb = new FakeDb({
      sync_meta: [{ key: "last_pulled_at", value: "2026-02-01T00:00:00.000Z" }],
    });
    mockServer.setRows("plans", [serverRow("p1", "2026-01-31T23:58:00.000Z")]);
    keepAll();

    await pullChanges();
    await pullChanges();

    expect(await cursor()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("TC-SY-54 a first-ever pull sends no cursor filter at all", async () => {
    keepAll();

    await pullChanges();

    expect(mockServer.selects.find((s) => s.table === "plans")?.gt).toBeNull();
  });

  it("TC-SY-55 leaves the cursor untouched when nothing changed", async () => {
    mockDb = new FakeDb({
      sync_meta: [{ key: "last_pulled_at", value: "2026-02-01T00:00:00.000Z" }],
    });
    keepAll();

    await pullChanges();

    expect(await cursor()).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("TC-SY-55b — the overlap floor itself", () => {
  it("TC-SY-55b subtracts the overlap from a real cursor", () => {
    expect(pullFloor("2026-02-01T00:00:00.000Z")).toBe(
      "2026-01-31T23:55:00.000Z",
    );
  });

  it("TC-SY-55c asks for everything when there is no cursor", () => {
    expect(pullFloor(null)).toBeNull();
  });

  it("TC-SY-55d asks for everything rather than filter on a junk cursor", () => {
    expect(pullFloor("not-a-date")).toBeNull();
  });
});

describe("TC-SY-56..58 — merging a pulled page", () => {
  it("TC-SY-56 writes a pulled row into the mirror, marked clean", async () => {
    mockServer.setRows("plans", [serverRow("p1", "2026-03-01T00:00:00.000Z")]);
    keepAll();

    await pullChanges();

    expect(mockDb.rows("plans")[0]).toMatchObject({ id: "p1", _dirty: 0 });
  });

  it("TC-SY-57 never overwrites a row that still holds an un-pushed edit", async () => {
    mockDb = new FakeDb({
      plans: [mirrorRow("plans", { id: "p1", name: "mine" }, 1)],
    });
    mockServer.setRows("plans", [
      { ...serverRow("p1", "2026-03-01T00:00:00.000Z"), name: "theirs" },
    ]);
    keepAll();

    await pullChanges();

    expect(mockDb.rows("plans")[0].name).toBe("mine");
    expect(mockDb.rows("plans")[0]._dirty).toBe(1);
  });

  it("TC-SY-58 a windowed table is fetched only back to its own horizon", async () => {
    keepAll();

    await pullChanges();

    const audit = mockServer.selects.find((s) => s.table === "audit_logs");
    const cut = Date.parse(audit?.gte?.[1] as string);
    const days = Math.round((Date.now() - cut) / 86_400_000);
    expect(audit?.gte?.[0]).toBe("occurred_at");
    expect(days).toBe(AUDIT_LOCAL_DAYS);
  });
});

describe("TC-SY-59..61 — a push-only table is never pulled", () => {
  it("TC-SY-59 never requests exception_logs", async () => {
    keepAll();

    await pullChanges();

    expect(mockServer.selects.some((s) => s.table === "exception_logs")).toBe(
      false,
    );
  });

  it("TC-SY-60 still requests an append-only table that IS pulled", async () => {
    keepAll();

    await pullChanges();

    expect(mockServer.selects.some((s) => s.table === "audit_logs")).toBe(true);
  });

  it("TC-SY-61 pulls every reconciled table's id list", async () => {
    keepAll();

    await pullChanges();

    for (const t of RECONCILED) {
      expect(
        mockServer.selects.some((s) => s.table === t && s.columns === "id"),
      ).toBe(true);
    }
  });
});

describe("TC-SY-62..65 — a row deleted elsewhere is dropped locally", () => {
  it("TC-SY-62 deletes a clean local row the server no longer holds", async () => {
    mockDb = new FakeDb({
      customers: [
        mirrorRow("customers", { id: "keep" }, 0),
        mirrorRow("customers", { id: "gone" }, 0),
      ],
    });
    keepAll();
    mockServer.setRows("customers", [{ id: "keep" }]);

    await pullChanges();

    expect(mockDb.rows("customers").map((r) => r.id)).toEqual(["keep"]);
  });

  it("TC-SY-63 NEVER deletes a row that still holds an un-pushed edit", async () => {
    mockDb = new FakeDb({
      customers: [mirrorRow("customers", { id: "mine" }, 1)],
    });
    keepAll();
    mockServer.setRows("customers", [{ id: "kept-elsewhere" }]);

    await pullChanges();

    expect(mockDb.rows("customers").map((r) => r.id)).toContain("mine");
  });

  it("TC-SY-64 an EMPTY server list never wipes the table — empty is ambiguous", async () => {
    mockDb = new FakeDb({
      customers: [
        mirrorRow("customers", { id: "a" }, 0),
        mirrorRow("customers", { id: "b" }, 0),
      ],
    });
    keepAll();
    mockServer.setRows("customers", []);

    await pullChanges();

    expect(mockDb.rows("customers")).toHaveLength(2);
  });

  it("TC-SY-65 a ledger table is never reconciled — its rows are only ever voided", async () => {
    mockDb = new FakeDb({
      charges: [mirrorRow("charges", { id: "chg", kind: "sale" }, 0)],
    });
    keepAll();

    await pullChanges();

    expect(mockDb.rows("charges")).toHaveLength(1);
  });
});

describe("TC-SY-66..68 — pruning a windowed table", () => {
  const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();

  it("TC-SY-66 drops a clean row past the window", async () => {
    mockDb = new FakeDb({
      audit_logs: [mirrorRow("audit_logs", { id: "a", occurred_at: old }, 0)],
    });

    await pruneWindowedTables(mockDb as never);

    expect(mockDb.rows("audit_logs")).toEqual([]);
  });

  it("TC-SY-67 KEEPS an un-pushed row however old — it is the only copy", async () => {
    mockDb = new FakeDb({
      audit_logs: [mirrorRow("audit_logs", { id: "a", occurred_at: old }, 1)],
    });

    await pruneWindowedTables(mockDb as never);

    expect(mockDb.rows("audit_logs")).toHaveLength(1);
  });

  it("TC-SY-68 keeps a row inside the window and never touches an unwindowed table", async () => {
    mockDb = new FakeDb({
      audit_logs: [
        mirrorRow("audit_logs", { id: "a", occurred_at: recent }, 0),
      ],
      charges: [mirrorRow("charges", { id: "c", occurred_at: old }, 0)],
    });

    await pruneWindowedTables(mockDb as never);

    expect(mockDb.rows("audit_logs")).toHaveLength(1);
    expect(mockDb.rows("charges")).toHaveLength(1);
  });
});
