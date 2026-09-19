import {
  isAfterMonth,
  lastBillableMonth,
} from "@/src/modules/customer/customer-payments/utils/payWindow";
import { customer, line } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-PW-* — the collect window. A stopped line bills up to the month it was
// cancelled in, never up to today, so switching a customer off really does
// close the money door on the months after it.

const AT_SEP = "2026-09-17T10:00:00.000Z";
const AT_MAY = "2026-05-08T10:00:00.000Z";

function blocked(
  year: number,
  month: number,
  c = customer(),
  l = line(),
): boolean {
  return isAfterMonth({ year, month }, lastBillableMonth(c, l));
}

describe("lastBillableMonth", () => {
  beforeEach(() => freezeToday(2026, 11, 20));
  afterEach(unfreeze);

  it("TC-PW-01 a running line stops at the current month", () => {
    expect(lastBillableMonth(customer(), line())).toEqual({
      year: 2026,
      month: 11,
    });
  });

  it("TC-PW-02 a cancelled line stops at its own cancel month", () => {
    const cancelled = line({ active: false, cancelledAt: AT_SEP });
    expect(lastBillableMonth(customer(), cancelled)).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it("TC-PW-03 an inactive customer stops at the customer cancel month", () => {
    const gone = customer({ active: false, cancelledAt: AT_SEP });
    expect(lastBillableMonth(gone, line())).toEqual({ year: 2026, month: 9 });
  });

  it("TC-PW-04 with both stopped the EARLIER date wins", () => {
    const gone = customer({ active: false, cancelledAt: AT_MAY });
    const cancelled = line({ active: false, cancelledAt: AT_SEP });
    expect(lastBillableMonth(gone, cancelled)).toEqual({
      year: 2026,
      month: 5,
    });
  });

  it("TC-PW-05 an inactive row with no stamp falls back to the current month", () => {
    const gone = customer({ active: false, cancelledAt: null });
    const cancelled = line({ active: false, cancelledAt: null });
    expect(lastBillableMonth(gone, cancelled)).toEqual({
      year: 2026,
      month: 11,
    });
  });

  it("TC-PW-06 no line selected reads the customer alone", () => {
    const gone = customer({ active: false, cancelledAt: AT_SEP });
    expect(lastBillableMonth(gone, null)).toEqual({ year: 2026, month: 9 });
    expect(lastBillableMonth(customer(), null)).toEqual({
      year: 2026,
      month: 11,
    });
  });
});

describe("the collect gate", () => {
  beforeEach(() => freezeToday(2026, 11, 20));
  afterEach(unfreeze);

  it("TC-PW-07 a running line pays past + current, never calendar-future", () => {
    expect(blocked(2026, 10)).toBe(false);
    expect(blocked(2026, 11)).toBe(false);
    expect(blocked(2026, 12)).toBe(true);
  });

  it("TC-PW-08 the cancel month itself is still payable", () => {
    const cancelled = line({ active: false, cancelledAt: AT_SEP });
    expect(blocked(2026, 9, customer(), cancelled)).toBe(false);
  });

  it("TC-PW-09 months after the cancel month are blocked, past ones are not", () => {
    const cancelled = line({ active: false, cancelledAt: AT_SEP });
    expect(blocked(2026, 8, customer(), cancelled)).toBe(false);
    expect(blocked(2026, 10, customer(), cancelled)).toBe(true);
    expect(blocked(2026, 11, customer(), cancelled)).toBe(true);
  });

  it("TC-PW-10 the stop carries across the year end", () => {
    const cancelled = line({
      active: false,
      cancelledAt: "2025-12-10T10:00:00.000Z",
    });
    expect(blocked(2025, 12, customer(), cancelled)).toBe(false);
    expect(blocked(2026, 1, customer(), cancelled)).toBe(true);
  });
});
