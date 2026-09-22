import {
  type Entry,
  delta,
  groupBy,
  shareOfTotal,
  sumByKey,
  sumUsdOf,
  topN,
} from "@/src/modules/reports/utils/aggregate";

// Reports aggregate in memory and re-implement no money rule. What they CAN get
// wrong is arithmetic no one reads twice: a divide by zero rendering "Infinity%"
// on a dashboard, or a share going negative and inverting a bar.

const entry = (key: string, usd: number, count = 1): Entry => ({
  key,
  usd,
  count,
});

describe("TC-AG-01..05 — grouping rows by a key", () => {
  it("TC-AG-01 buckets rows under their key", () => {
    const rows = [
      { k: "a", n: 1 },
      { k: "b", n: 2 },
      { k: "a", n: 3 },
    ];

    const out = groupBy(rows, (r) => r.k);

    expect(out.get("a")).toEqual([rows[0], rows[2]]);
    expect(out.get("b")).toEqual([rows[1]]);
  });

  it("TC-AG-02 an empty list groups to nothing", () => {
    expect(groupBy([], (r: { k: string }) => r.k).size).toBe(0);
  });

  it("TC-AG-03 keeps first-seen key order", () => {
    const rows = [{ k: "z" }, { k: "a" }, { k: "z" }];

    expect([...groupBy(rows, (r) => r.k).keys()]).toEqual(["z", "a"]);
  });

  it("TC-AG-04 keeps input order inside a bucket", () => {
    const rows = [
      { k: "a", n: 1 },
      { k: "a", n: 2 },
    ];

    expect(groupBy(rows, (r) => r.k).get("a")?.map((r) => r.n)).toEqual([1, 2]);
  });

  it("TC-AG-05 never dedupes — the same row twice appears twice", () => {
    const row = { k: "a" };

    expect(groupBy([row, row], (r) => r.k).get("a")).toHaveLength(2);
  });
});

describe("TC-AG-06..12 — sum and count per key, largest first", () => {
  const rows = [
    { k: "sale", usd: 10 },
    { k: "month", usd: 50 },
    { k: "sale", usd: 5 },
  ];

  it("TC-AG-06 sums each key and counts its rows", () => {
    const out = sumByKey(rows, (r) => r.k, (r) => r.usd);

    expect(out).toEqual([
      { key: "month", usd: 50, count: 1 },
      { key: "sale", usd: 15, count: 2 },
    ]);
  });

  it("TC-AG-07 sorts DESCENDING by usd, not by key or count", () => {
    const out = sumByKey(rows, (r) => r.k, (r) => r.usd);

    expect(out.map((e) => e.key)).toEqual(["month", "sale"]);
  });

  it("TC-AG-08 an empty list sums to nothing", () => {
    expect(sumByKey([], (r: { k: string }) => r.k, () => 0)).toEqual([]);
  });

  it("TC-AG-09 a ZERO-amount row still counts", () => {
    const out = sumByKey([{ k: "a", usd: 0 }], (r) => r.k, (r) => r.usd);

    expect(out).toEqual([{ key: "a", usd: 0, count: 1 }]);
  });

  it("TC-AG-10 a NEGATIVE total sorts last, by value and not by size", () => {
    const out = sumByKey(
      [
        { k: "refund", usd: -100 },
        { k: "small", usd: 1 },
      ],
      (r) => r.k,
      (r) => r.usd,
    );

    expect(out.map((e) => e.key)).toEqual(["small", "refund"]);
  });

  it("TC-AG-11 reads the amount once per row", () => {
    const getUsd = jest.fn((r: { usd: number }) => r.usd);

    sumByKey([{ k: "a", usd: 1 }, { k: "a", usd: 2 }], () => "a", getUsd);

    expect(getUsd).toHaveBeenCalledTimes(2);
  });

  it("TC-AG-12 never mutates the rows it was given", () => {
    const input = [{ k: "a", usd: 1 }];

    sumByKey(input, (r) => r.k, (r) => r.usd);

    expect(input).toEqual([{ k: "a", usd: 1 }]);
  });
});

describe("TC-AG-13..18 — folding the tail into one 'other' entry", () => {
  const five = [
    entry("a", 5),
    entry("b", 4),
    entry("c", 3),
    entry("d", 2),
    entry("e", 1),
  ];

  it("TC-AG-13 a list at or under the cap is returned untouched", () => {
    const three = five.slice(0, 3);

    expect(topN(three, 3)).toBe(three);
  });

  it("TC-AG-14 folds everything past the cap into one entry", () => {
    const out = topN(five, 3);

    expect(out).toHaveLength(4);
    expect(out[3]).toEqual({ key: "__other__", usd: 3, count: 2 });
  });

  it("TC-AG-15 the folded entry carries the summed COUNT too", () => {
    const out = topN([entry("a", 9), entry("b", 1, 4), entry("c", 1, 6)], 1);

    expect(out[1]).toEqual({ key: "__other__", usd: 2, count: 10 });
  });

  it("TC-AG-16 the sentinel key can be overridden", () => {
    expect(topN(five, 2, "REST")[2].key).toBe("REST");
  });

  it("TC-AG-17 a cap of zero folds the whole list into one row", () => {
    const out = topN(five, 0);

    expect(out).toEqual([{ key: "__other__", usd: 15, count: 5 }]);
  });

  it("TC-AG-18 never mutates the list it was given", () => {
    const input = [entry("a", 5), entry("b", 4)];

    topN(input, 1);

    expect(input).toHaveLength(2);
  });
});

describe("TC-AG-19..24 — each entry's share of the total", () => {
  it("TC-AG-19 splits a simple total into fractions, not percents", () => {
    const out = shareOfTotal([entry("a", 75), entry("b", 25)]);

    expect(out[0].share).toBeCloseTo(0.75);
    expect(out[1].share).toBeCloseTo(0.25);
  });

  it("TC-AG-20 an ALL-ZERO list shares out 0, never NaN", () => {
    const out = shareOfTotal([entry("a", 0), entry("b", 0)]);

    expect(out.map((e) => e.share)).toEqual([0, 0]);
    expect(out.every((e) => Number.isFinite(e.share))).toBe(true);
  });

  it("TC-AG-21 an empty list shares nothing", () => {
    expect(shareOfTotal([])).toEqual([]);
  });

  it("TC-AG-22 a NEGATIVE amount still gets a POSITIVE share — a bar has no negative width", () => {
    const out = shareOfTotal([entry("a", 50), entry("b", -50)]);

    expect(out[1].share).toBeCloseTo(0.5);
    expect(out[1].share).toBeGreaterThan(0);
  });

  it("TC-AG-23 the shares add up to one", () => {
    const out = shareOfTotal([entry("a", 33), entry("b", 33), entry("c", 34)]);

    expect(out.reduce((t, e) => t + e.share, 0)).toBeCloseTo(1);
  });

  it("TC-AG-24 keeps the original fields and does not mutate them", () => {
    const input = [entry("a", 10)];

    const out = shareOfTotal(input);

    expect(out[0]).toMatchObject({ key: "a", usd: 10, count: 1 });
    expect(input[0]).not.toHaveProperty("share");
  });
});

describe("TC-AG-25..31 — this period against the one before", () => {
  it("TC-AG-25 a rise reports the gap and the fraction", () => {
    expect(delta(150, 100)).toEqual({ abs: 50, pct: 0.5 });
  });

  it("TC-AG-26 a fall reports both as negative", () => {
    expect(delta(50, 100)).toEqual({ abs: -50, pct: -0.5 });
  });

  it("TC-AG-27 growing from NOTHING gives no percentage, never Infinity", () => {
    expect(delta(100, 0)).toEqual({ abs: 100, pct: null });
  });

  it("TC-AG-28 nothing to nothing is no change and no percentage, never NaN", () => {
    expect(delta(0, 0)).toEqual({ abs: 0, pct: null });
  });

  it("TC-AG-29 a smaller LOSS reads as an improvement (positive)", () => {
    expect(delta(-50, -100)).toEqual({ abs: 50, pct: 0.5 });
  });

  it("TC-AG-30 a bigger loss reads as a decline", () => {
    expect(delta(-150, -100)).toEqual({ abs: -50, pct: -0.5 });
  });

  it("TC-AG-31 no change at all is zero, not null", () => {
    expect(delta(100, 100)).toEqual({ abs: 0, pct: 0 });
  });
});

describe("TC-AG-32..35 — totalling a column", () => {
  it("TC-AG-32 sums what the accessor returns", () => {
    expect(sumUsdOf([{ u: 1 }, { u: 2 }, { u: 3 }], (r) => r.u)).toBe(6);
  });

  it("TC-AG-33 an empty list totals zero, never NaN", () => {
    expect(sumUsdOf([], (r: { u: number }) => r.u)).toBe(0);
  });

  it("TC-AG-34 negatives subtract", () => {
    expect(sumUsdOf([{ u: 10 }, { u: -4 }], (r) => r.u)).toBe(6);
  });

  it("TC-AG-35 reads each row exactly once", () => {
    const getUsd = jest.fn((r: { u: number }) => r.u);

    sumUsdOf([{ u: 1 }, { u: 2 }], getUsd);

    expect(getUsd).toHaveBeenCalledTimes(2);
  });
});
