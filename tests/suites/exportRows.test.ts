import { toCsv } from "@/src/shared/lib/csv";
import { loadAllPages } from "@/src/shared/hooks/loadAllPages";
import {
  cell,
  fieldsOf,
  flattenRow,
  header,
  isReadable,
} from "@/src/shared/hooks/exportRowFormat";

describe("readable fields", () => {
  // A UUID is not a fact anyone reads, and the name behind it already rides on
  // the row's nested record — so dropping the id loses nothing.
  it("drops ids and the tenant, keeps everything else", () => {
    expect(isReadable("id")).toBe(false);
    expect(isReadable("planId")).toBe(false);
    expect(isReadable("customerId")).toBe(false);
    expect(isReadable("tenantId")).toBe(false);
    expect(isReadable("name")).toBe(true);
    expect(isReadable("amount")).toBe(true);
  });

  // "paid" ends in "id" but is not one.
  it("does not mistake a word ending in id for an id", () => {
    expect(isReadable("paid")).toBe(true);
    expect(isReadable("valid")).toBe(true);
  });
});

describe("flattening", () => {
  it("keeps the name behind a dropped id", () => {
    const out = flattenRow({
      planId: "p-1",
      plan: { id: "p-1", name: "Gold" },
    });
    expect(out["plan.name"]).toBe("Gold");
    expect(out.planId).toBeUndefined();
    expect(out["plan.id"]).toBeUndefined();
  });

  it("joins a list of records into one cell by name", () => {
    const out = flattenRow({
      customerPlans: [{ plan: { name: "Gold" } }, { plan: { name: "Silver" } }],
    });
    expect(out.customerPlans).toBe("Gold, Silver");
  });

  it("never writes [object Object]", () => {
    const out = flattenRow({ deep: { a: { b: { c: { d: "x" } } } } });
    for (const value of Object.values(out)) {
      expect(String(value)).not.toContain("[object Object]");
    }
  });

  it("leaves scalars alone", () => {
    const out = flattenRow({ name: "Ali", amount: 25, active: true });
    expect(out.name).toBe("Ali");
    expect(out.amount).toBe(25);
  });
});

describe("columns", () => {
  // A row missing a field the others have must not shift every later cell into
  // the wrong column.
  it("takes the union of the rows keys, first seen first", () => {
    const fields = fieldsOf([
      { a: 1, b: 2 },
      { a: 3, c: 4 },
    ]);
    expect(fields).toEqual(["a", "b", "c"]);
  });

  it("turns an unnamed field into words, never a raw key", () => {
    const out = header("someNewField");
    expect(out).toBe("Some new field");
    expect(out).not.toContain("export.col_");
  });

  it("names a nested column by its leaf", () => {
    expect(header("plan.name")).toBe("Plan name");
  });
});

describe("cells", () => {
  it("writes an empty cell for a missing value, never the word null", () => {
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
  });

  it("keeps a number a number so the sheet can sum it", () => {
    expect(cell(25.5)).toBe(25.5);
  });

  // A customer called `Ali, "Abu" Hassan` is what corrupts a hand-rolled CSV.
  it("quotes separators instead of splitting the cell", () => {
    const csv = toCsv(["name"], [['Ali, "Abu" Hassan']]);
    expect(csv.slice(1)).toBe('name\r\n"Ali, ""Abu"" Hassan"');
  });
});

describe("loading every page", () => {
  // Drives the screen's own fetchMore, so the slice's guards still apply and
  // the rows land where the list already reads them.
  function pagedList(total: number, pageSize = 30) {
    const rows: number[] = [];
    let page = 0;
    return {
      read: () => rows,
      hasMore: () => rows.length < total,
      fetchMore: async () => {
        const start = page * pageSize;
        rows.push(
          ...Array.from(
            { length: Math.min(pageSize, total - start) },
            (_, i) => start + i,
          ),
        );
        page += 1;
      },
    };
  }

  it("walks past the first page to the whole list", async () => {
    const list = pagedList(100);
    const all = await loadAllPages(list.read, list.hasMore, list.fetchMore);
    expect(all).toHaveLength(100);
  });

  it("does nothing when there is nothing more to load", async () => {
    const fetchMore = jest.fn();
    const all = await loadAllPages(
      () => [1, 2],
      () => false,
      fetchMore,
    );
    expect(fetchMore).not.toHaveBeenCalled();
    expect(all).toEqual([1, 2]);
  });

  // A hasMore that never clears would otherwise spin forever.
  it("gives up when a page adds nothing", async () => {
    const fetchMore = jest.fn(async () => {});
    const all = await loadAllPages(
      () => [1],
      () => true,
      fetchMore,
    );
    expect(fetchMore).toHaveBeenCalledTimes(1);
    expect(all).toEqual([1]);
  });
});
