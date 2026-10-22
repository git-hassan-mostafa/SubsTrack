import { paidBillingMonths } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { paidUntil } from "@shared/modules/customer/customer-payments/utils/paidUntil";
import { bill } from "../helpers/factories";

// TC-PU-* — "Paid until" = last day of the newest month money reached; worked out, never saved.

const until = (...bills: Parameters<typeof bill>[]) =>
  paidUntil(paidBillingMonths(bills.map((args) => bill(...args))));

describe("paid until", () => {
  it("TC-PU-01 no money yet → no date", () => {
    expect(until()).toBeNull();
    expect(until(["2026-03-01", 0])).toBeNull();
  });

  it("TC-PU-02 the last day of the newest paid month", () => {
    expect(until(["2026-01-01", 20], ["2026-08-01", 20])).toBe("2026-08-31");
  });

  it("TC-PU-03 February and month ends of 30 days", () => {
    expect(until(["2026-02-01", 20])).toBe("2026-02-28");
    expect(until(["2028-02-01", 20])).toBe("2028-02-29");
    expect(until(["2026-09-01", 20])).toBe("2026-09-30");
  });

  it("TC-PU-04 a part-paid month counts as reached", () => {
    expect(until(["2026-05-01", 5, { amount: 20 }])).toBe("2026-05-31");
  });

  it("TC-PU-05 a gap of no-service months does not hold it back", () => {
    expect(until(["2026-01-01", 20], ["2026-04-01", 20])).toBe("2026-04-30");
  });

  it("TC-PU-06 a multi-month bill runs to the end of its last month", () => {
    expect(until(["2026-11-01", 60, { durationMonths: 3, amount: 60 }])).toBe("2027-01-31");
  });

  it("TC-PU-07 a voided bill moves it back", () => {
    expect(
      until(["2026-01-01", 20], ["2026-02-01", 20, { voidedAt: "2026-02-03T10:00:00Z" }]),
    ).toBe("2026-01-31");
  });
});
