import {
  clearNaturalKeyDuplicates,
  dirtyIdSet,
  markDeleted,
  upsertFromServer,
  upsertManyFromServer,
} from "@/src/core/offline/db/dml";
import { FakeDb, mirrorRow } from "../helpers/fakeSqlite";

// The pull's merge rule: an un-pushed local row is the ONLY copy of that money,
// so the server never overwrites it. Everything here is asserted against a store
// that enforces the same PRIMARY KEY and natural-key UNIQUE index Postgres does.

type Row = Record<string, unknown>;

// `dml.ts` takes expo-sqlite's SQLiteDatabase; the fake implements the handful of
// methods it actually calls, so the cast is the seam, not a hole in the types.
const db = (seed: Record<string, Row[]> = {}) =>
  new FakeDb(seed) as FakeDb & Parameters<typeof dirtyIdSet>[0];

const charge = (over: Record<string, unknown> = {}, dirty: 0 | 1 = 0) =>
  mirrorRow(
    "charges",
    {
      id: "chg-1",
      tenant_id: "t1",
      customer_id: "cus-1",
      kind: "month",
      amount: "20",
      currency_id: "usd",
      ...over,
    },
    dirty,
  );

describe("TC-SY-01..06 — a dirty local row wins the merge", () => {
  it("TC-SY-01 reports exactly the ids that still hold an un-pushed edit", async () => {
    const d = db({
      charges: [
        charge({ id: "a" }, 1),
        charge({ id: "b", customer_plan_id: "p2" }, 0),
        charge({ id: "c", customer_plan_id: "p3" }, 1),
      ],
    });

    const dirty = await dirtyIdSet(d, "charges", ["a", "b", "c"]);

    expect([...dirty].sort()).toEqual(["a", "c"]);
  });

  it("TC-SY-02 asks about no ids at all without touching the table", async () => {
    const d = db({ charges: [charge({ id: "a" }, 1)] });

    await expect(dirtyIdSet(d, "charges", [])).resolves.toEqual(new Set());
  });

  it("TC-SY-03 batches a set larger than one statement's bind limit", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `c${i}`);
    const d = db({
      charges: ids.map((id, i) =>
        charge({ id, customer_plan_id: `p${i}` }, i % 2 === 0 ? 1 : 0),
      ),
    });

    const dirty = await dirtyIdSet(d, "charges", ids);

    expect(dirty.size).toBe(225);
    expect(dirty.has("c0")).toBe(true);
    expect(dirty.has("c1")).toBe(false);
  });

  it("TC-SY-04 merges a server row over a CLEAN local row", async () => {
    const d = db({ charges: [charge({ id: "a", amount: "20" }, 0)] });

    await upsertManyFromServer(d, "charges", [
      { ...charge({ id: "a", amount: "35" }), _dirty: undefined },
    ]);

    expect(d.rows("charges")[0].amount).toBe("35");
  });

  it("TC-SY-05 leaves the merged row CLEAN so the next push does not re-send it", async () => {
    const d = db({});

    await upsertManyFromServer(d, "charges", [charge({ id: "a" })]);

    expect(d.rows("charges")[0]._dirty).toBe(0);
  });

  it("TC-SY-06 merges a whole page in one pass, insert and update together", async () => {
    const d = db({ charges: [charge({ id: "a", amount: "20" }, 0)] });

    await upsertManyFromServer(d, "charges", [
      charge({ id: "a", amount: "99" }),
      charge({ id: "b", amount: "40", customer_plan_id: "p2" }),
    ]);

    const byId = Object.fromEntries(d.rows("charges").map((r) => [r.id, r]));
    expect(byId.a.amount).toBe("99");
    expect(byId.b.amount).toBe("40");
  });
});

describe("TC-SY-07..12 — a natural-key duplicate never stalls the table", () => {
  const incoming = (id: string) =>
    charge({ id, customer_plan_id: "line-1", billing_month: "2026-03-01" });

  it("TC-SY-07 drops a CLEAN local row holding the incoming row's month under another id", async () => {
    const d = db({
      charges: [
        charge(
          {
            id: "local-old",
            customer_plan_id: "line-1",
            billing_month: "2026-03-01",
          },
          0,
        ),
      ],
    });

    const skip = await clearNaturalKeyDuplicates(d, "charges", [
      incoming("server-new"),
    ]);

    expect(skip.size).toBe(0);
    expect(d.rows("charges")).toEqual([]);
  });

  it("TC-SY-08 SKIPS the incoming row when the local duplicate is still dirty", async () => {
    const d = db({
      charges: [
        charge(
          {
            id: "local-money",
            customer_plan_id: "line-1",
            billing_month: "2026-03-01",
          },
          1,
        ),
      ],
    });

    const skip = await clearNaturalKeyDuplicates(d, "charges", [
      incoming("server-new"),
    ]);

    expect(skip.has("server-new")).toBe(true);
    expect(d.rows("charges").map((r) => r.id)).toEqual(["local-money"]);
  });

  it("TC-SY-09 leaves a duplicate that is the SAME row alone", async () => {
    const d = db({ charges: [{ ...incoming("same"), _dirty: 0 }] });

    const skip = await clearNaturalKeyDuplicates(d, "charges", [
      incoming("same"),
    ]);

    expect(skip.size).toBe(0);
    expect(d.rows("charges").map((r) => r.id)).toEqual(["same"]);
  });

  it("TC-SY-10 is a no-op for a table with no natural key", async () => {
    const d = db({ collections: [mirrorRow("collections", { id: "a" }, 0)] });

    const skip = await clearNaturalKeyDuplicates(d, "collections", [
      { id: "b" },
    ]);

    expect(skip.size).toBe(0);
    expect(d.rows("collections").map((r) => r.id)).toEqual(["a"]);
  });

  it("TC-SY-11 clears the way so the page then merges without a UNIQUE failure", async () => {
    const d = db({
      charges: [
        charge(
          {
            id: "local-old",
            customer_plan_id: "line-1",
            billing_month: "2026-03-01",
          },
          0,
        ),
      ],
    });
    const rows = [incoming("server-new")];

    const skip = await clearNaturalKeyDuplicates(d, "charges", rows);
    await upsertManyFromServer(
      d,
      "charges",
      rows.filter((r) => !skip.has(r.id as string)),
    );

    expect(d.rows("charges").map((r) => r.id)).toEqual(["server-new"]);
  });

  it("TC-SY-12 keys a collection item on (collection_id, charge_id)", async () => {
    const d = db({
      collection_items: [
        mirrorRow(
          "collection_items",
          { id: "old", collection_id: "col-1", charge_id: "chg-1" },
          0,
        ),
      ],
    });

    const skip = await clearNaturalKeyDuplicates(d, "collection_items", [
      { id: "new", collection_id: "col-1", charge_id: "chg-1" },
    ]);

    expect(skip.size).toBe(0);
    expect(d.rows("collection_items")).toEqual([]);
  });
});

describe("TC-SY-13..15 — the single-row read-through cache merge", () => {
  it("TC-SY-13 inserts a row the mirror has never seen", async () => {
    const d = db({});

    await upsertFromServer(d, "tenants", {
      id: "t1",
      name: "Acme",
      active: true,
    });

    expect(d.rows("tenants")[0]).toMatchObject({ id: "t1", name: "Acme" });
  });

  it("TC-SY-14 overwrites the cached copy on a second read", async () => {
    const d = db({});

    await upsertFromServer(d, "tenants", { id: "t1", name: "Acme" });
    await upsertFromServer(d, "tenants", { id: "t1", name: "Acme ISP" });

    expect(d.rows("tenants")).toHaveLength(1);
    expect(d.rows("tenants")[0].name).toBe("Acme ISP");
  });

  it("TC-SY-15 marks the cached row clean", async () => {
    const d = db({});

    await upsertFromServer(d, "tenants", { id: "t1", name: "Acme" });

    expect(d.rows("tenants")[0]._dirty).toBe(0);
  });
});

describe("TC-SY-16..18 — a hard delete is logged for replay", () => {
  it("TC-SY-16 logs the table and the row id", async () => {
    const d = db({});

    await markDeleted(d, "customers", "cus-1");

    expect(d.rows("pending_deletes")).toEqual([
      { table_name: "customers", row_id: "cus-1" },
    ]);
  });

  it("TC-SY-17 logging the same delete twice leaves ONE entry", async () => {
    const d = db({});

    await markDeleted(d, "customers", "cus-1");
    await markDeleted(d, "customers", "cus-1");

    expect(d.rows("pending_deletes")).toHaveLength(1);
  });

  it("TC-SY-18 keeps the same id logged separately per table", async () => {
    const d = db({});

    await markDeleted(d, "customers", "shared-id");
    await markDeleted(d, "plans", "shared-id");

    expect(d.rows("pending_deletes")).toHaveLength(2);
  });
});
