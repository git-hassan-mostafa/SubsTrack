import {
  DEFAULT_ALL_DEBTS_FILTERS,
  filterAndSortDebts,
  flattenDebts,
  hasActiveAllDebtsFilters,
  selectAllDebts,
  totalUsdOf,
  type AllDebtsFilters,
} from "@/src/modules/transaction/debts/utils/allDebtsFilter";
import type { CustomerDebts, DebtsView, OpenItem } from "@/src/core/types";
import { openItem } from "../helpers/factories";

// TC-AD-* — the all-debts sheet's pure view over the DebtsView the screen
// already holds. It must never invent a figure the Debts screen does not show,
// so every case here pins it to the same rows and the same money.

const TODAY = new Date("2026-03-15T12:00:00.000Z");

function debtor(over: Partial<CustomerDebts> = {}): CustomerDebts {
  return {
    customerId: "cust-1",
    customerName: "Ali",
    items: [],
    unpaidMonths: [],
    debtUsd: 0,
    unpaidMonthsUsd: 0,
    oldestDaysLate: 0,
    ...over,
  };
}

function view(customers: CustomerDebts[]): DebtsView {
  return {
    customers,
    summary: {
      totalUsd: 0,
      monthsUsd: 0,
      salesUsd: 0,
      manualUsd: 0,
      customerCount: customers.length,
      writtenOffUsd: 0,
    },
  };
}

function filters(over: Partial<AllDebtsFilters> = {}): AllDebtsFilters {
  return { ...DEFAULT_ALL_DEBTS_FILTERS, ...over };
}

function keys(rows: OpenItem[]): (string | null)[] {
  return rows.map((r) => r.chargeId);
}

describe("all-debts: flattening", () => {
  it("TC-AD-01 takes every customer's debt items", () => {
    const v = view([
      debtor({ customerId: "a", items: [openItem({ chargeId: "a1" })] }),
      debtor({ customerId: "b", items: [openItem({ chargeId: "b1" })] }),
    ]);
    expect(keys(flattenDebts(v))).toEqual(["a1", "b1"]);
  });

  it("TC-AD-02 leaves UNPAID MONTHS out — they are owed but are not debts", () => {
    const v = view([
      debtor({
        items: [openItem({ chargeId: "debt" })],
        unpaidMonths: [
          openItem({ chargeId: null, billingMonth: "2026-02-01" }),
        ],
      }),
    ]);
    expect(keys(flattenDebts(v))).toEqual(["debt"]);
  });

  it("TC-AD-03 a null view is an empty list, never a throw", () => {
    expect(flattenDebts(null)).toEqual([]);
    expect(selectAllDebts(null, filters(), TODAY)).toEqual([]);
  });
});

describe("all-debts: filtering", () => {
  const rows = view([
    debtor({
      customerName: "Ali",
      items: [
        openItem({ chargeId: "m", kind: "month", label: "Jan 2026" }),
        openItem({ chargeId: "s", kind: "sale", label: "Receipt A1B2C3" }),
      ],
    }),
    debtor({
      customerId: "cust-2",
      customerName: "Sara",
      items: [
        openItem({
          chargeId: "x",
          kind: "manual",
          customerId: "cust-2",
          customerName: "Sara",
          label: "Router fee",
        }),
      ],
    }),
  ]);

  it("TC-AD-04 filters by kind", () => {
    expect(
      keys(selectAllDebts(rows, filters({ kind: "sale" }), TODAY)),
    ).toEqual(["s"]);
  });

  it("TC-AD-05 search matches the customer name", () => {
    expect(
      keys(selectAllDebts(rows, filters({ search: "sara" }), TODAY)),
    ).toEqual(["x"]);
  });

  it("TC-AD-06 search matches the bill label too", () => {
    expect(
      keys(selectAllDebts(rows, filters({ search: "router" }), TODAY)),
    ).toEqual(["x"]);
  });

  it("TC-AD-07 no filters keeps every debt row", () => {
    expect(selectAllDebts(rows, filters(), TODAY)).toHaveLength(3);
  });
});

describe("all-debts: status", () => {
  const late = openItem({ chargeId: "late", dueDate: "2026-01-01" });
  const future = openItem({ chargeId: "future", dueDate: "2026-12-01" });
  const part = openItem({
    chargeId: "part",
    dueDate: "2026-12-01",
    amount: 20,
    paid: 5,
  });
  const v = view([debtor({ items: [late, future, part] })]);

  it("TC-AD-08 'late' keeps only bills past their due date", () => {
    expect(keys(selectAllDebts(v, filters({ status: "late" }), TODAY))).toEqual(
      ["late"],
    );
  });

  it("TC-AD-09 'not late yet' is the exact complement", () => {
    expect(
      keys(selectAllDebts(v, filters({ status: "not_late" }), TODAY)).sort(),
    ).toEqual(["future", "part"]);
  });

  it("TC-AD-10 'partly paid' keys off MONEY, not lateness", () => {
    expect(
      keys(selectAllDebts(v, filters({ status: "partial" }), TODAY)),
    ).toEqual(["part"]);
  });
});

describe("all-debts: sorting", () => {
  const jan = openItem({ chargeId: "jan", dueDate: "2026-01-01", amount: 5 });
  const feb = openItem({ chargeId: "feb", dueDate: "2026-02-01", amount: 50 });
  const v = view([debtor({ items: [feb, jan] })]);

  it("TC-AD-11 oldest-first is the waterfall's own order", () => {
    expect(keys(selectAllDebts(v, filters({ sort: "oldest" }), TODAY))).toEqual(
      ["jan", "feb"],
    );
  });

  it("TC-AD-12 newest-first is its exact reverse", () => {
    expect(keys(selectAllDebts(v, filters({ sort: "newest" }), TODAY))).toEqual(
      ["feb", "jan"],
    );
  });

  it("TC-AD-13 largest/smallest sort on the USD balance", () => {
    expect(
      keys(selectAllDebts(v, filters({ sort: "largest" }), TODAY)),
    ).toEqual(["feb", "jan"]);
    expect(
      keys(selectAllDebts(v, filters({ sort: "smallest" }), TODAY)),
    ).toEqual(["jan", "feb"]);
  });

  it("TC-AD-14 equal amounts still order deterministically", () => {
    const a = openItem({ chargeId: "aaa", dueDate: "2026-01-01", amount: 10 });
    const b = openItem({ chargeId: "bbb", dueDate: "2026-01-01", amount: 10 });
    const tied = view([debtor({ items: [b, a] })]);
    expect(
      keys(selectAllDebts(tied, filters({ sort: "largest" }), TODAY)),
    ).toEqual(["aaa", "bbb"]);
  });

  it("TC-AD-24 the default sort is newest CREATED first, not due date", () => {
    const early = openItem({
      chargeId: "early",
      dueDate: "2026-03-01",
      createdAt: "2026-01-05T08:00:00.000Z",
    });
    const late = openItem({
      chargeId: "late",
      dueDate: "2026-01-01",
      createdAt: "2026-02-20T08:00:00.000Z",
    });
    const made = view([debtor({ items: [early, late] })]);
    expect(DEFAULT_ALL_DEBTS_FILTERS.sort).toBe("created");
    expect(keys(selectAllDebts(made, filters(), TODAY))).toEqual([
      "late",
      "early",
    ]);
  });

  it("TC-AD-25 last updated reads the bill's own updatedAt", () => {
    const touched = openItem({
      chargeId: "touched",
      createdAt: "2026-01-01T00:00:00.000Z",
      charge: { updatedAt: "2026-03-10T00:00:00.000Z" } as OpenItem["charge"],
    });
    const idle = openItem({
      chargeId: "idle",
      createdAt: "2026-02-01T00:00:00.000Z",
      charge: { updatedAt: "2026-02-01T00:00:00.000Z" } as OpenItem["charge"],
    });
    const v2 = view([debtor({ items: [idle, touched] })]);
    expect(
      keys(selectAllDebts(v2, filters({ sort: "updated" }), TODAY)),
    ).toEqual(["touched", "idle"]);
  });

  it("TC-AD-15 a rate snapshot decides the amount order, not the raw balance", () => {
    const lbp = openItem({
      chargeId: "lbp",
      amount: 900_000,
      ratePerUsdSnapshot: 90_000,
    });
    const usd = openItem({
      chargeId: "usd",
      amount: 50,
      ratePerUsdSnapshot: 1,
    });
    const mixed = view([debtor({ items: [lbp, usd] })]);
    expect(
      keys(selectAllDebts(mixed, filters({ sort: "largest" }), TODAY)),
    ).toEqual(["usd", "lbp"]);
  });
});

describe("all-debts: the written-off scope shares one rule set", () => {
  const writtenOff = [
    openItem({ chargeId: "w1", kind: "sale", label: "Receipt A1B2C3" }),
    openItem({ chargeId: "w2", kind: "manual", label: "Router fee" }),
  ];

  it("TC-AD-20 a flat written-off list takes the same kind filter", () => {
    expect(
      keys(filterAndSortDebts(writtenOff, filters({ kind: "manual" }), TODAY)),
    ).toEqual(["w2"]);
  });

  it("TC-AD-21 and the same search and sort", () => {
    expect(
      keys(
        filterAndSortDebts(writtenOff, filters({ search: "receipt" }), TODAY),
      ),
    ).toEqual(["w1"]);
    expect(
      keys(filterAndSortDebts(writtenOff, filters({ sort: "newest" }), TODAY)),
    ).toEqual(["w2", "w1"]);
  });

  it("TC-AD-22 selectAllDebts is just the flatten fed through it", () => {
    const v = view([debtor({ items: writtenOff })]);
    expect(selectAllDebts(v, filters(), TODAY)).toEqual(
      filterAndSortDebts(writtenOff, filters(), TODAY),
    );
  });

  it("TC-AD-23 written-off rows never reach the live DebtsView flatten", () => {
    // The live scope reads `DebtsView`, which excludes them at source; the
    // written-off scope is a separate read. Nothing merges the two.
    expect(flattenDebts(view([debtor({ items: [] })]))).toEqual([]);
  });
});

describe("all-debts: totals and filter state", () => {
  it("TC-AD-16 the shown total is the sum of the SHOWN rows in USD", () => {
    const lbp = openItem({ amount: 90_000, ratePerUsdSnapshot: 90_000 });
    const usd = openItem({ amount: 4, ratePerUsdSnapshot: 1 });
    expect(totalUsdOf([lbp, usd])).toBe(5);
  });

  it("TC-AD-17 the total counts the BALANCE, so a part payment is excluded", () => {
    expect(totalUsdOf([openItem({ amount: 20, paid: 5 })])).toBe(15);
  });

  it("TC-AD-18 the default filter set is not 'active'", () => {
    expect(hasActiveAllDebtsFilters(DEFAULT_ALL_DEBTS_FILTERS)).toBe(false);
    expect(hasActiveAllDebtsFilters(filters({ search: "   " }))).toBe(false);
  });

  it("TC-AD-19 any changed filter flags the clear button", () => {
    expect(hasActiveAllDebtsFilters(filters({ kind: "sale" }))).toBe(true);
    expect(hasActiveAllDebtsFilters(filters({ status: "late" }))).toBe(true);
    expect(hasActiveAllDebtsFilters(filters({ sort: "newest" }))).toBe(true);
    expect(hasActiveAllDebtsFilters(filters({ search: "ali" }))).toBe(true);
  });
});
