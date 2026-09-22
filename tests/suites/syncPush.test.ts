import { PUSH_WAVES, TABLE_BY_NAME } from "@/src/core/offline/db/tables";
import { FakeDb, mirrorRow } from "../helpers/fakeSqlite";
import { FakeSupabase } from "../helpers/fakeSupabase";

// What the push sends, in what order, and on which conflict key. A wrong
// conflict target does not lose one row — it wedges that table's queue forever,
// so every row of money behind it stops going up.

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

import { pushDirty } from "@/src/core/offline/sync/push";

const seed = (tables: Record<string, Record<string, unknown>[]>) => {
  mockDb = new FakeDb(tables);
};

const sent = (table: string) =>
  mockServer.upserts.filter((u) => u.table === table);

beforeEach(() => {
  mockServer.reset();
  mockDb = new FakeDb({});
});

describe("TC-SY-20..24 — only dirty rows go up, and they come back clean", () => {
  it("TC-SY-20 sends a dirty row and leaves a clean one alone", async () => {
    seed({
      customers: [
        mirrorRow("customers", { id: "a", name: "Dirty" }, 1),
        mirrorRow("customers", { id: "b", name: "Clean" }, 0),
      ],
    });

    await pushDirty();

    expect(sent("customers")).toHaveLength(1);
    expect(sent("customers")[0].rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("TC-SY-21 clears _dirty once the server accepted the row", async () => {
    seed({ customers: [mirrorRow("customers", { id: "a" }, 1)] });

    await pushDirty();

    expect(mockDb.rows("customers")[0]._dirty).toBe(0);
  });

  it("TC-SY-22 a REJECTED row stays dirty for the next cycle", async () => {
    mockServer.upsertError = "duplicate key value";
    seed({ customers: [mirrorRow("customers", { id: "a" }, 1)] });

    await pushDirty();

    expect(mockDb.rows("customers")[0]._dirty).toBe(1);
  });

  it("TC-SY-23 never issues a request for a table with nothing dirty", async () => {
    seed({ customers: [mirrorRow("customers", { id: "a" }, 0)] });

    await pushDirty();

    expect(mockServer.upserts).toHaveLength(0);
  });

  it("TC-SY-24 one table failing does not stop another going up", async () => {
    mockServer.failTables.add("customers");
    seed({
      customers: [mirrorRow("customers", { id: "a" }, 1)],
      plans: [mirrorRow("plans", { id: "p" }, 1)],
    });

    await pushDirty();

    expect(mockDb.rows("customers")[0]._dirty).toBe(1);
    expect(mockDb.rows("plans")[0]._dirty).toBe(0);
  });
});

describe("TC-SY-25..29 — the conflict target is decided per ROW", () => {
  const chargeRow = (over: Record<string, unknown>) =>
    mirrorRow("charges", { tenant_id: "t1", kind: "month", ...over }, 1);

  it("TC-SY-25 a MONTH bill converges on (customer_plan_id, billing_month)", async () => {
    seed({
      charges: [
        chargeRow({
          id: "c1",
          customer_plan_id: "line-1",
          billing_month: "2026-03-01",
        }),
      ],
    });

    await pushDirty();

    expect(sent("charges")[0].onConflict).toBe(
      "customer_plan_id,billing_month",
    );
  });

  it("TC-SY-26 a SALE bill leaves both columns null, so it converges on id", async () => {
    seed({
      charges: [
        chargeRow({
          id: "c2",
          kind: "sale",
          customer_plan_id: null,
          billing_month: null,
        }),
      ],
    });

    await pushDirty();

    expect(sent("charges")[0].onConflict).toBe("id");
  });

  it("TC-SY-27 month and sale bills go up as SEPARATE requests", async () => {
    seed({
      charges: [
        chargeRow({
          id: "c1",
          customer_plan_id: "line-1",
          billing_month: "2026-03-01",
        }),
        chargeRow({
          id: "c2",
          kind: "sale",
          customer_plan_id: null,
          billing_month: null,
        }),
      ],
    });

    await pushDirty();

    expect(
      sent("charges")
        .map((u) => u.onConflict)
        .sort(),
    ).toEqual(["customer_plan_id,billing_month", "id"]);
  });

  it("TC-SY-28 collection items converge on (collection_id, charge_id)", async () => {
    seed({
      collection_items: [
        mirrorRow(
          "collection_items",
          { id: "i1", collection_id: "col-1", charge_id: "chg-1" },
          1,
        ),
      ],
    });

    await pushDirty();

    expect(sent("collection_items")[0].onConflict).toBe(
      "collection_id,charge_id",
    );
  });

  it("TC-SY-29 tenant settings converge on (tenant_id, key)", async () => {
    seed({
      tenant_settings: [
        mirrorRow(
          "tenant_settings",
          { id: "s1", tenant_id: "t1", key: "x" },
          1,
        ),
      ],
    });

    await pushDirty();

    expect(sent("tenant_settings")[0].onConflict).toBe("tenant_id,key");
  });
});

describe("TC-SY-30..33 — columns the server owns are never sent", () => {
  it("TC-SY-30 strips updated_at, which a Postgres trigger owns", async () => {
    seed({
      customers: [
        mirrorRow(
          "customers",
          { id: "a", updated_at: "2020-01-01T00:00:00.000Z" },
          1,
        ),
      ],
    });

    await pushDirty();

    expect(sent("customers")[0].rows[0]).not.toHaveProperty("updated_at");
  });

  it("TC-SY-31 never sends the local-only _dirty flag", async () => {
    seed({ customers: [mirrorRow("customers", { id: "a" }, 1)] });

    await pushDirty();

    expect(sent("customers")[0].rows[0]).not.toHaveProperty("_dirty");
  });

  it("TC-SY-32 an append-only table ignores duplicates instead of overwriting", async () => {
    seed({ audit_logs: [mirrorRow("audit_logs", { id: "a" }, 1)] });

    await pushDirty();

    expect(TABLE_BY_NAME.audit_logs.appendOnly).toBe(true);
    expect(sent("audit_logs")[0].ignoreDuplicates).toBe(true);
  });

  it("TC-SY-33 an ordinary table overwrites rather than ignoring", async () => {
    seed({ customers: [mirrorRow("customers", { id: "a" }, 1)] });

    await pushDirty();

    expect(sent("customers")[0].ignoreDuplicates).toBe(false);
  });
});

describe("TC-SY-34..37 — a parent always goes up before its child", () => {
  it("TC-SY-34 pushes waves in order: customers before charges before items", async () => {
    seed({
      customers: [mirrorRow("customers", { id: "cus" }, 1)],
      charges: [
        mirrorRow(
          "charges",
          { id: "chg", kind: "sale", customer_plan_id: null },
          1,
        ),
      ],
      collection_items: [
        mirrorRow(
          "collection_items",
          { id: "itm", collection_id: "col", charge_id: "chg" },
          1,
        ),
      ],
    });

    await pushDirty();

    const order = mockServer.upserts.map((u) => u.table);
    expect(order.indexOf("customers")).toBeLessThan(order.indexOf("charges"));
    expect(order.indexOf("charges")).toBeLessThan(
      order.indexOf("collection_items"),
    );
  });

  it("TC-SY-35 collection_items is the LAST wave — it points at two parents", () => {
    expect(PUSH_WAVES[PUSH_WAVES.length - 1]).toEqual(["collection_items"]);
  });

  it("TC-SY-36 every wave table is a real table, declared exactly once", () => {
    const all = PUSH_WAVES.flat();

    expect(new Set(all).size).toBe(all.length);
    for (const t of all) expect(TABLE_BY_NAME[t]).toBeDefined();
  });

  it("TC-SY-37 a GLOBAL table is never pushed — the tenant does not own it", async () => {
    seed({ app_options: [mirrorRow("app_options", { id: "o" }, 1)] });

    await pushDirty();

    expect(TABLE_BY_NAME.app_options.scope).toBe("global");
    expect(sent("app_options")).toHaveLength(0);
  });
});

describe("TC-SY-38..41 — logged hard deletes are replayed", () => {
  it("TC-SY-38 replays a logged delete and clears the log entry", async () => {
    seed({ pending_deletes: [{ table_name: "customers", row_id: "gone" }] });

    await pushDirty();

    expect(mockServer.deletes).toEqual([
      { table: "customers", ids: ["gone"] },
    ]);
    expect(mockDb.rows("pending_deletes")).toEqual([]);
  });

  it("TC-SY-39 sends one request per table, not one per row", async () => {
    seed({
      pending_deletes: [
        { table_name: "customers", row_id: "a" },
        { table_name: "customers", row_id: "b" },
      ],
    });

    await pushDirty();

    expect(mockServer.deletes).toEqual([
      { table: "customers", ids: ["a", "b"] },
    ]);
  });

  it("TC-SY-40 a failed batch retries ROW BY ROW, so one bad row blocks no other", async () => {
    mockServer.deleteError = "violates foreign key constraint";
    seed({
      pending_deletes: [
        { table_name: "customers", row_id: "a" },
        { table_name: "customers", row_id: "b" },
      ],
    });

    await pushDirty();

    expect(mockServer.deletes.map((d) => d.ids)).toEqual([
      ["a", "b"],
      ["a"],
      ["b"],
    ]);
  });

  it("TC-SY-41 a delete the server refuses stays logged for the next cycle", async () => {
    mockServer.deleteError = "violates foreign key constraint";
    seed({ pending_deletes: [{ table_name: "customers", row_id: "a" }] });

    await pushDirty();

    expect(mockDb.rows("pending_deletes")).toHaveLength(1);
  });
});
