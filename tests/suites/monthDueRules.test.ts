import type { UnpaidStartRule } from "@/src/core/types";
import {
  hasReachedStartDay,
  isBeforeStartDate,
  isNotDueYet,
  isNotLateYet,
  startDayOfMonth,
} from "@/src/modules/customer/customer-payments/utils/monthDueRules";
import { freezeToday, unfreeze } from "../helpers/clock";

// Gotcha #83: the per-tenant unpaid rule decides TWO different things, and mixing
// them is the trap. `isNotDueYet` is the CURRENT month's colour; `isNotLateYet` is
// when the customer starts reading "Overdue" — and that one is about LAST month.

const DAY_RULE: UnpaidStartRule = "customer_start_day";
const MONTH_RULE: UnpaidStartRule = "month_start";

afterEach(unfreeze);

describe("TC-DR-01..04 — a month before the line ever started", () => {
  it("TC-DR-01 an earlier year is before the start", () => {
    expect(isBeforeStartDate(2025, 12, "2026-03-10")).toBe(true);
  });

  it("TC-DR-02 an earlier month of the start year is before the start", () => {
    expect(isBeforeStartDate(2026, 2, "2026-03-10")).toBe(true);
  });

  it("TC-DR-03 the start month itself is NOT before the start", () => {
    expect(isBeforeStartDate(2026, 3, "2026-03-10")).toBe(false);
  });

  it("TC-DR-04 a later month is not before the start", () => {
    expect(isBeforeStartDate(2026, 4, "2026-03-10")).toBe(false);
  });
});

describe("TC-DR-05..08 — the billing day read off a start date", () => {
  it("TC-DR-05 takes the day part of the start date", () => {
    expect(startDayOfMonth("2026-03-17")).toBe(17);
  });

  it("TC-DR-06 falls back to the 1st when the day part is missing", () => {
    expect(startDayOfMonth("2026-03")).toBe(1);
  });

  it("TC-DR-07 falls back to the 1st on an unreadable day", () => {
    expect(startDayOfMonth("2026-03-xx")).toBe(1);
  });

  it("TC-DR-08 a day of 0 falls back to the 1st", () => {
    expect(startDayOfMonth("2026-03-00")).toBe(1);
  });
});

describe("TC-DR-09..13 — has this month reached the billing day?", () => {
  it("TC-DR-09 false the day BEFORE the billing day", () => {
    freezeToday(2026, 3, 9);

    expect(hasReachedStartDay(2026, 3, "2026-01-10")).toBe(false);
  });

  it("TC-DR-10 true ON the billing day", () => {
    freezeToday(2026, 3, 10);

    expect(hasReachedStartDay(2026, 3, "2026-01-10")).toBe(true);
  });

  it("TC-DR-11 true after the billing day", () => {
    freezeToday(2026, 3, 11);

    expect(hasReachedStartDay(2026, 3, "2026-01-10")).toBe(true);
  });

  it("TC-DR-12 a 31st start CLAMPS to the last day of a short month", () => {
    freezeToday(2026, 2, 28);

    expect(hasReachedStartDay(2026, 2, "2026-01-31")).toBe(true);
  });

  it("TC-DR-13 a clamped month is still not reached the day before its end", () => {
    freezeToday(2026, 2, 27);

    expect(hasReachedStartDay(2026, 2, "2026-01-31")).toBe(false);
  });
});

describe("TC-DR-14..19 — isNotDueYet paints the CURRENT month", () => {
  it("TC-DR-14 the current month is not due before its billing day", () => {
    freezeToday(2026, 3, 5);

    expect(isNotDueYet(DAY_RULE, 2026, 3, "2026-01-10")).toBe(true);
  });

  it("TC-DR-15 the current month IS due once the billing day arrives", () => {
    freezeToday(2026, 3, 10);

    expect(isNotDueYet(DAY_RULE, 2026, 3, "2026-01-10")).toBe(false);
  });

  it("TC-DR-16 a PAST month is never 'not due yet', whatever the day", () => {
    freezeToday(2026, 3, 5);

    expect(isNotDueYet(DAY_RULE, 2026, 2, "2026-01-10")).toBe(false);
  });

  it("TC-DR-17 a FUTURE month is not answered by this rule", () => {
    freezeToday(2026, 3, 5);

    expect(isNotDueYet(DAY_RULE, 2026, 4, "2026-01-10")).toBe(false);
  });

  it("TC-DR-18 the month_start rule never defers anything", () => {
    freezeToday(2026, 3, 5);

    expect(isNotDueYet(MONTH_RULE, 2026, 3, "2026-01-10")).toBe(false);
  });

  it("TC-DR-19 the same month of a DIFFERENT year is not the current month", () => {
    freezeToday(2026, 3, 5);

    expect(isNotDueYet(DAY_RULE, 2025, 3, "2024-01-10")).toBe(false);
  });
});

describe("TC-DR-20..26 — isNotLateYet is about LAST month (gotcha #83)", () => {
  it("TC-DR-20 last month is not late until THIS month's billing day", () => {
    freezeToday(2026, 3, 5);

    expect(isNotLateYet(DAY_RULE, 2026, 2, "2026-01-10")).toBe(true);
  });

  it("TC-DR-21 last month turns late once this month's billing day arrives", () => {
    freezeToday(2026, 3, 10);

    expect(isNotLateYet(DAY_RULE, 2026, 2, "2026-01-10")).toBe(false);
  });

  it("TC-DR-22 anything older than last month is late on sight", () => {
    freezeToday(2026, 3, 5);

    expect(isNotLateYet(DAY_RULE, 2026, 1, "2026-01-10")).toBe(false);
  });

  it("TC-DR-23 the CURRENT month is not what this rule answers", () => {
    freezeToday(2026, 3, 5);

    expect(isNotLateYet(DAY_RULE, 2026, 3, "2026-01-10")).toBe(false);
  });

  it("TC-DR-24 last month across a YEAR boundary still counts as last month", () => {
    freezeToday(2026, 1, 5);

    expect(isNotLateYet(DAY_RULE, 2025, 12, "2025-06-10")).toBe(true);
  });

  it("TC-DR-25 the month_start rule makes every unpaid month late at once", () => {
    freezeToday(2026, 3, 5);

    expect(isNotLateYet(MONTH_RULE, 2026, 2, "2026-01-10")).toBe(false);
  });

  it("TC-DR-26 the two rules disagree on purpose for the same day", () => {
    freezeToday(2026, 3, 5);

    expect(isNotDueYet(DAY_RULE, 2026, 3, "2026-01-10")).toBe(true);
    expect(isNotLateYet(DAY_RULE, 2026, 3, "2026-01-10")).toBe(false);
    expect(isNotLateYet(DAY_RULE, 2026, 2, "2026-01-10")).toBe(true);
  });
});
