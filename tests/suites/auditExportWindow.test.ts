import { showsOlderThanThisMonth } from "@/src/modules/admin/audit/utils/exportWindow";

const MONTH_START = "2026-09-01";
const at = (occurredAt: string) => ({ occurredAt });

describe("audit export window", () => {
  // Nothing loaded yet is not "older" — the export can still offer this month.
  it("is false for an empty list", () => {
    expect(showsOlderThanThisMonth([], MONTH_START)).toBe(false);
  });

  it("is false while every loaded entry is from this month", () => {
    const entries = [at("2026-09-16T10:00:00Z"), at("2026-09-01T00:00:00Z")];
    expect(showsOlderThanThisMonth(entries, MONTH_START)).toBe(false);
  });

  // Scrolling pulled in something from before the 1st, so the screen already
  // shows more than this month and the export just takes what is there.
  it("is true once a loaded entry predates this month", () => {
    const entries = [at("2026-09-16T10:00:00Z"), at("2026-08-31T23:59:00Z")];
    expect(showsOlderThanThisMonth(entries, MONTH_START)).toBe(true);
  });

  // The 1st at midnight is IN this month — an off-by-one here would hide the
  // option on a screen that never left the month.
  it("does not count the first of the month as older", () => {
    expect(
      showsOlderThanThisMonth([at("2026-09-01T00:00:00Z")], MONTH_START),
    ).toBe(false);
  });

  it("finds an old entry wherever it sits in the list", () => {
    const entries = [
      at("2026-09-16T10:00:00Z"),
      at("2025-12-01T00:00:00Z"),
      at("2026-09-02T00:00:00Z"),
    ];
    expect(showsOlderThanThisMonth(entries, MONTH_START)).toBe(true);
  });
});
