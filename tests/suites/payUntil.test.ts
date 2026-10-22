import type { MonthBill, SkippedMonth } from "@shared/core/types";
import type { LineGates } from "@shared/modules/customer/customer-payments/utils/monthActions";
import { cellJoins, paymentLinks } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import { buildMonthGrid, paidBillingMonths } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { payUntilChoices } from "@shared/modules/customer/customer-payments/utils/payUntil";
import { mergeCollection } from "@shared/state/slices/payments/utils/mergeCollection";
import { bill, collection, collectionItem, line, plan, skip } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-PU-* — "Pay until": every month from the next unpaid one up to the pick, as ONE payment.
const P = plan({ id: "p1", price: 20, prepaid: true });
const PREPAID = line({ id: "line-1", startDate: "2026-01-01", planId: "p1", plan: P, prepaid: true });

function choicesOf(
  bills: MonthBill[],
  opts: { skips?: SkippedMonth[]; payLimit?: LineGates["payLimit"]; durationMonths?: number; startDate?: string } = {},
) {
  return payUntilChoices({
    line: { ...PREPAID, startDate: opts.startDate ?? PREPAID.startDate },
    bills,
    skips: opts.skips ?? [],
    unpaidRule: "month_start",
    gates: {
      payLimit: opts.payLimit ?? null,
      uncoveredMonths: [],
      paidMonths: paidBillingMonths(bills),
      usageLine: false,
    },
    durationMonths: opts.durationMonths ?? 1,
  });
}

const monthsOf = (choice: { months: { billingMonth: string }[] }) => choice.months.map((m) => m.billingMonth);

afterEach(unfreeze);

describe("pay until", () => {
  it("TC-PU-01 paid ahead → starts the month after the newest paid one", () => {
    freezeToday(2026, 6, 15);
    const choices = choicesOf([bill("2026-08-01", 20, { amount: 20 })]);
    expect(choices[0]).toMatchObject({ lastMonth: "2026-09-01", paidUntil: "2026-09-30" });
    expect(monthsOf(choices[2])).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(choices).toHaveLength(12);
  });

  it("TC-PU-02 expired → starts this month; the no-service months stay unpaid", () => {
    freezeToday(2026, 6, 15);
    const choices = choicesOf([bill("2026-03-01", 20, { amount: 20 })]);
    expect(monthsOf(choices[0])).toEqual(["2026-06-01"]);
    expect(choices[0].months[0].status).toBe("no_service");
    expect(choices[11].lastMonth).toBe("2027-05-01");
  });

  it("TC-PU-03 never paid, line starts later → starts at the line's first month", () => {
    freezeToday(2026, 6, 15);
    expect(choicesOf([], { startDate: "2026-08-01" })[0].lastMonth).toBe("2026-08-01");
  });

  it("TC-PU-04 a skipped month is left out and blocks nothing", () => {
    freezeToday(2026, 6, 15);
    const choices = choicesOf([bill("2026-05-01", 20, { amount: 20 })], { skips: [skip("2026-07-01")] });
    expect(choices.map((c) => c.lastMonth).slice(0, 2)).toEqual(["2026-06-01", "2026-08-01"]);
    expect(monthsOf(choices[1])).toEqual(["2026-06-01", "2026-08-01"]);
  });

  it("TC-PU-05 the rest of a part-paid newest month rides along first", () => {
    freezeToday(2026, 6, 15);
    const choices = choicesOf([bill("2026-06-01", 5, { amount: 20 })]);
    expect(monthsOf(choices[0])).toEqual(["2026-06-01", "2026-07-01"]);
    expect(choices[0].paidUntil).toBe("2026-07-31");
  });

  it("TC-PU-06 a stopped line offers nothing past the month it stopped in", () => {
    freezeToday(2026, 6, 15);
    const choices = choicesOf([], { payLimit: { year: 2026, month: 7 } });
    expect(choices.map((c) => c.lastMonth)).toEqual(["2026-06-01", "2026-07-01"]);
  });

  it("TC-PU-07 an N-month plan picks whole blocks", () => {
    freezeToday(2026, 2, 15);
    const paid = [bill("2026-01-01", 60, { amount: 60, durationMonths: 3 })];
    const choices = choicesOf(paid, { durationMonths: 3 });
    expect(choices.map((c) => c.lastMonth)).toEqual(["2026-06-01", "2026-09-01", "2026-12-01", "2027-03-01"]);
    expect(choices[1].months).toHaveLength(6);
  });
});

describe("months paid by one payment", () => {
  const paidBy = (month: string, ids: string[], collected = 20) => ({
    ...bill(month, collected, { id: `chg-${month}`, amount: 20 }),
    collectionIds: ids,
  });

  it("TC-PU-08 bills settled whole by one shared hand-over are linked; others are not", () => {
    const links = paymentLinks([
      paidBy("2026-01-01", ["col-a"]),
      paidBy("2026-02-01", ["col-a"]),
      paidBy("2026-03-01", ["col-a", "col-b"]),
      paidBy("2026-04-01", ["col-b"], 5),
      paidBy("2026-05-01", ["col-c"]),
    ]);
    expect([...links]).toEqual([
      ["chg-2026-01-01", "col-a"],
      ["chg-2026-02-01", "col-a"],
    ]);
  });

  it("TC-PU-09 linked months join into one pill in the grid", () => {
    freezeToday(2026, 6, 15);
    const bills = [paidBy("2026-01-01", ["col-a"]), paidBy("2026-02-01", ["col-a"]), paidBy("2026-03-01", ["col-b"])];
    const grid = buildMonthGrid(PREPAID, bills, [], 2026);
    const joins = cellJoins(grid, 4, null, paymentLinks(bills));
    expect(joins[0].joinEnd).toBe(true);
    expect(joins[1].joinStart).toBe(true);
    expect(joins[1].joinEnd).toBe(false);
  });

  it("TC-PU-10 the store patch adds and drops the hand-over on each bill", () => {
    const held = [paidBy("2026-01-01", ["col-old"])];
    const col = collection({ id: "col-new", items: [collectionItem({ chargeId: "chg-2026-01-01", amount: 5 })] });
    const added = mergeCollection(held, col);
    expect(added[0].collectionIds).toEqual(["col-old", "col-new"]);
    expect(mergeCollection(added, col, -1)[0].collectionIds).toEqual(["col-old"]);
  });
});
