import { BaseRepository, type RangeRead } from "@shared/core/utils/BaseRepository";
import { toRange, type ReportPeriod } from "@shared/core/utils/dateRange";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import {
  collectionFindOptions,
  defaultCollectionFilters,
  defaultCollectionsPeriod,
  hasCollectionFilter,
  type CollectionFilterChoice,
} from "@shared/modules/ledger/utils/collectionFilters";
import { store } from "../helpers/fakeLedger";

// TC-MR-* — the Money received list: one filter shape for both apps, a paged
// read that counts the whole filter, and a total that no row cap can cut.

class RangeProbe extends BaseRepository {
  readAll<R>(readRange: (from: number, to: number) => PromiseLike<RangeRead>): Promise<R[]> {
    return this.readEveryRow<R>(readRange);
  }
}

function server(rows: number[], cap: number, calls: [number, number][]) {
  return (from: number, to: number): Promise<RangeRead> => {
    calls.push([from, to]);
    const end = Math.min(to, from + cap - 1);
    return Promise.resolve({ data: rows.slice(from, end + 1), error: null, count: rows.length });
  };
}

const numbers = (count: number) => Array.from({ length: count }, (_, i) => i);

const FEBRUARY: ReportPeriod = { preset: "custom", fromDate: "2026-02-01", toDate: "2026-02-28" };

const choice = (over: Partial<CollectionFilterChoice> = {}): CollectionFilterChoice => ({
  ...defaultCollectionFilters(),
  period: FEBRUARY,
  ...over,
});

beforeEach(() => store.reset());

describe("readEveryRow", () => {
  it("TC-MR-01 reads past the 1000-row cap, every row once, in order", async () => {
    const calls: [number, number][] = [];
    const rows = await new RangeProbe().readAll<number>(server(numbers(2500), 1000, calls));
    expect(rows).toEqual(numbers(2500));
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("TC-MR-02 a server with a SMALLER cap still gives every row", async () => {
    const calls: [number, number][] = [];
    const rows = await new RangeProbe().readAll<number>(server(numbers(1000), 300, calls));
    expect(rows).toEqual(numbers(1000));
    expect(calls[1]).toEqual([300, 599]);
  });

  it("TC-MR-03 one read when everything fits", async () => {
    const calls: [number, number][] = [];
    const rows = await new RangeProbe().readAll<number>(server(numbers(40), 1000, calls));
    expect(rows).toHaveLength(40);
    expect(calls).toHaveLength(1);
  });

  it("TC-MR-04 a failed later page throws instead of giving a short total", async () => {
    const read = (from: number): Promise<RangeRead> =>
      Promise.resolve(
        from === 0
          ? { data: numbers(1000), error: null, count: 1500 }
          : { data: null, error: { message: "boom" }, count: null },
      );
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(new RangeProbe().readAll<number>(read)).rejects.toThrow("boom");
  });
});

describe("collectionFindOptions", () => {
  it("TC-MR-05 the default view: this month, live and voided, newest received first", () => {
    const options = collectionFindOptions(defaultCollectionFilters(), null);
    const range = toRange(defaultCollectionsPeriod());
    expect(options).toMatchObject({
      startIso: range.startIso,
      endExclusiveIso: range.endExclusiveIso,
      includeVoided: true,
      voidedOnly: false,
      sortField: "received_at",
      sortDirection: "desc",
      customerId: undefined,
      kind: undefined,
      searchTerm: undefined,
    });
  });

  it("TC-MR-06 the status filter picks live only or voided only", () => {
    expect(collectionFindOptions(choice({ status: "live" }), null)).toMatchObject({
      includeVoided: false,
      voidedOnly: false,
    });
    expect(collectionFindOptions(choice({ status: "voided" }), null)).toMatchObject({
      includeVoided: true,
      voidedOnly: true,
    });
  });

  it("TC-MR-07 the branch, collector, type and search pass straight through", () => {
    const options = collectionFindOptions(
      choice({ receivedByUserId: "user-2", kind: "sale" }),
      "branch-1",
      "ali",
    );
    expect(options).toMatchObject({
      branchFilter: "branch-1",
      receivedByUserId: "user-2",
      kind: "sale",
      searchTerm: "ali",
    });
  });
});

describe("hasCollectionFilter", () => {
  it("TC-MR-08 only the default view counts as unfiltered", () => {
    expect(hasCollectionFilter(defaultCollectionFilters())).toBe(false);
    expect(hasCollectionFilter(choice())).toBe(true);
    const base = defaultCollectionFilters();
    expect(hasCollectionFilter({ ...base, status: "live" })).toBe(true);
    expect(hasCollectionFilter({ ...base, kind: "month" })).toBe(true);
    expect(hasCollectionFilter({ ...base, receivedByUserId: "user-2" })).toBe(true);
    expect(hasCollectionFilter({ ...base, sortDirection: "asc" })).toBe(true);
    expect(hasCollectionFilter({ ...base, sortField: "created_at" })).toBe(true);
  });
});

describe("getHistoryPage", () => {
  function seedFebruary(count: number) {
    const chg = store.seedCharge({ amount: 1000 });
    return numbers(count).map((i) =>
      store.seedCollection(chg.id, 10, {
        received_at: `2026-02-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
        created_at: `2026-02-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );
  }

  it("TC-MR-09 a page holds its window; the total counts the WHOLE filter", async () => {
    seedFebruary(5);
    const options = collectionFindOptions(choice(), null);
    const page = await collectionService.getHistoryPage({ ...options, offset: 2, limit: 2 });
    expect(page.total).toBe(5);
    expect(page.rows.map((r) => r.receivedAt.slice(0, 10))).toEqual(["2026-02-03", "2026-02-02"]);
  });

  it("TC-MR-10 a voided payment stays listed but leaves the period total", async () => {
    const [first] = seedFebruary(3);
    await collectionService.voidCollections([first.id], "user-1", "typo");
    const options = collectionFindOptions(choice(), null);
    const page = await collectionService.getHistoryPage({ ...options, offset: 0, limit: 25 });
    expect(page.total).toBe(3);
    expect(page.rows.find((r) => r.id === first.id)?.voidedAt).not.toBeNull();
    const totals = await collectionService.getMonthlyTotals(options);
    expect(Object.values(totals).reduce((sum, v) => sum + v, 0)).toBe(20);
  });

  it("TC-MR-11 'voided only' lists just the voids and has no total", async () => {
    const [first] = seedFebruary(3);
    await collectionService.voidCollections([first.id], "user-1", null);
    const options = collectionFindOptions(choice({ status: "voided" }), null);
    const page = await collectionService.getHistoryPage({ ...options, offset: 0, limit: 25 });
    expect(page.rows.map((r) => r.id)).toEqual([first.id]);
    expect(await collectionService.getMonthlyTotals(options)).toEqual({});
  });
});
