import {
  billForMonth,
  isDebtItem,
  monthItemFromEntry,
  openItemFromCharge,
  virtualMonthItem,
} from "@/src/modules/ledger/utils/openItems";
import { bill, charge } from "../helpers/factories";

// OWED vs DEBT. A fully unpaid month is OWED but is NOT a debt — it is red in the
// grid, which is its own screen. It becomes a debt the moment money part-pays it.
// The rule keys off MONEY, never off a row existing (gotcha #106): an EMPTY bill
// left by a voided collection must read exactly like a month never touched.

const VIRTUAL = {
  customerId: "cust-1",
  customerName: "Ali",
  branchId: null,
  customerPlanId: "line-1",
  billingMonth: "2026-03-01",
  durationMonths: 1,
  planId: "plan-1",
  label: "Mar 2026",
  amount: 20,
  currencyId: null,
  ratePerUsdSnapshot: 1,
  dueDate: "2026-03-01",
};

const ENTRY = {
  customerId: "cust-1",
  customerName: "Ali",
  branchId: null,
  customerPlanId: "line-1",
  planId: "plan-1",
  label: "Mar 2026",
  price: { amount: 20, currencyId: null, durationMonths: 1 },
  ratePerUsd: 1,
};

describe("TC-OI-01..08 — what counts as a DEBT", () => {
  it("TC-OI-01 a fully unpaid month is owed but is NOT a debt", () => {
    expect(isDebtItem("month", 0)).toBe(false);
  });

  it("TC-OI-02 a PARTLY paid month becomes a debt", () => {
    expect(isDebtItem("month", 0.01)).toBe(true);
  });

  it("TC-OI-03 an unpaid sale is a debt from day one — it is a pay-later", () => {
    expect(isDebtItem("sale", 0)).toBe(true);
  });

  it("TC-OI-04 a hand-typed fee is a debt by definition", () => {
    expect(isDebtItem("manual", 0)).toBe(true);
  });

  it("TC-OI-05 a NEGATIVE paid does not make a month a debt", () => {
    expect(isDebtItem("month", -5)).toBe(false);
  });

  it("TC-OI-06 a paid sale and a paid manual fee stay debts", () => {
    expect(isDebtItem("sale", 100)).toBe(true);
    expect(isDebtItem("manual", 100)).toBe(true);
  });

  it("TC-OI-07 minus zero is not money reaching the month", () => {
    expect(isDebtItem("month", -0)).toBe(false);
  });

  it("TC-OI-08 only the MONTH kind is ever exempt", () => {
    const kinds = ["month", "sale", "manual"] as const;

    expect(kinds.filter((k) => !isDebtItem(k, 0))).toEqual(["month"]);
  });
});

describe("TC-OI-09..15 — a stored bill as a collectable item", () => {
  it("TC-OI-09 the balance is the amount less what was collected", () => {
    const item = openItemFromCharge(charge({ amount: 50 }), 20, "Mar");

    expect(item.balance).toBe(30);
  });

  it("TC-OI-10 an untouched bill owes its whole amount", () => {
    const item = openItemFromCharge(charge({ amount: 50 }), 0, "Mar");

    expect(item).toMatchObject({ paid: 0, balance: 50, isDebt: false });
  });

  it("TC-OI-11 a PARTLY paid month reads as a debt", () => {
    const item = openItemFromCharge(charge({ amount: 50 }), 20, "Mar");

    expect(item.isDebt).toBe(true);
  });

  it("TC-OI-12 an OVERPAID bill is allowed to go negative, never clamped", () => {
    const item = openItemFromCharge(charge({ amount: 50 }), 80, "Mar");

    expect(item.balance).toBe(-30);
  });

  it("TC-OI-13 a bill with no customer collapses to an empty customer id", () => {
    const item = openItemFromCharge(charge({ customerId: null }), 0, "Mar");

    expect(item.customerId).toBe("");
  });

  it("TC-OI-14 the customer name is what the caller passed, not the charge's", () => {
    const item = openItemFromCharge(charge(), 0, "Mar", "Ali");

    expect(item.customerName).toBe("Ali");
    expect(openItemFromCharge(charge(), 0, "Mar").customerName).toBe("");
  });

  it("TC-OI-15 carries the frozen amount, currency and rate through untouched", () => {
    const c = charge({
      amount: 300000,
      currencyId: "cur-lbp",
      ratePerUsdSnapshot: 90000,
    });

    const item = openItemFromCharge(c, 0, "Mar");

    expect(item).toMatchObject({
      amount: 300000,
      currencyId: "cur-lbp",
      ratePerUsdSnapshot: 90000,
      chargeId: c.id,
    });
  });
});

describe("TC-OI-16..21 — a month that has no bill yet", () => {
  it("TC-OI-16 has no charge id — nothing was raised", () => {
    expect(virtualMonthItem(VIRTUAL).chargeId).toBeNull();
  });

  it("TC-OI-17 owes its whole amount and has taken nothing", () => {
    const item = virtualMonthItem(VIRTUAL);

    expect(item).toMatchObject({ paid: 0, balance: 20 });
  });

  it("TC-OI-18 is never a debt, however large", () => {
    expect(virtualMonthItem({ ...VIRTUAL, amount: 99999 }).isDebt).toBe(false);
  });

  it("TC-OI-19 sorts on its due date without pretending to be older", () => {
    const item = virtualMonthItem(VIRTUAL);

    expect(item.issuedAt).toBe(VIRTUAL.dueDate);
    expect(item.createdAt).toBe(VIRTUAL.dueDate);
  });

  it("TC-OI-20 is a month, never a sale", () => {
    const item = virtualMonthItem(VIRTUAL);

    expect(item.kind).toBe("month");
    expect(item.saleId).toBeNull();
  });

  it("TC-OI-21 is not an open-amount month unless it is said to be", () => {
    expect(virtualMonthItem(VIRTUAL).openAmount).toBe(false);
    expect(virtualMonthItem({ ...VIRTUAL, openAmount: true }).openAmount).toBe(
      true,
    );
  });
});

describe("TC-OI-22..29 — one month cell as something money can go against", () => {
  it("TC-OI-22 a month money has touched is collected against its BILL", () => {
    const b = bill("2026-03-01", 5);

    const item = monthItemFromEntry({
      ...ENTRY,
      entry: { charge: b.charge, collected: 5, billingMonth: "2026-03-01" },
    });

    expect(item).toMatchObject({ chargeId: b.charge.id, paid: 5, isDebt: true });
  });

  it("TC-OI-23 an EMPTY bill reads exactly like a month never touched (gotcha #106)", () => {
    const b = bill("2026-03-01", 0);

    const emptied = monthItemFromEntry({
      ...ENTRY,
      entry: { charge: b.charge, collected: 0, billingMonth: "2026-03-01" },
    });
    const untouched = monthItemFromEntry({
      ...ENTRY,
      entry: { charge: null, collected: 0, billingMonth: "2026-03-01" },
    });

    expect(emptied).toEqual(untouched);
    expect(emptied?.chargeId).toBeNull();
  });

  it("TC-OI-24 an emptied bill is RE-PRICED from the line, not from the dead row", () => {
    const b = bill("2026-03-01", 0, { amount: 999 });

    const item = monthItemFromEntry({
      ...ENTRY,
      price: { amount: 25, currencyId: null, durationMonths: 1 },
      entry: { charge: b.charge, collected: 0, billingMonth: "2026-03-01" },
    });

    expect(item?.amount).toBe(25);
  });

  it("TC-OI-25 a line with NO price leaves the month OPEN", () => {
    const item = monthItemFromEntry({
      ...ENTRY,
      price: { amount: null, currencyId: "cur-lbp", durationMonths: 1 },
      entry: { charge: null, collected: 0, billingMonth: "2026-03-01" },
    });

    expect(item).toMatchObject({
      openAmount: true,
      amount: 0,
      currencyId: null,
    });
  });

  it("TC-OI-26 a ZERO price is no price at all — the month stays open", () => {
    const item = monthItemFromEntry({
      ...ENTRY,
      price: { amount: 0, currencyId: null, durationMonths: 1 },
      entry: { charge: null, collected: 0, billingMonth: "2026-03-01" },
    });

    expect(item?.openAmount).toBe(true);
  });

  it("TC-OI-27 a priced month keeps its own currency", () => {
    const item = monthItemFromEntry({
      ...ENTRY,
      price: { amount: 300000, currencyId: "cur-lbp", durationMonths: 1 },
      entry: { charge: null, collected: 0, billingMonth: "2026-03-01" },
    });

    expect(item).toMatchObject({
      amount: 300000,
      currencyId: "cur-lbp",
      openAmount: false,
    });
  });

  it("TC-OI-28 a multi-month block carries its span", () => {
    const item = monthItemFromEntry({
      ...ENTRY,
      price: { amount: 60, currencyId: null, durationMonths: 3 },
      entry: { charge: null, collected: 0, billingMonth: "2026-03-01" },
    });

    expect(item).toMatchObject({ durationMonths: 3, amount: 60 });
  });

  it("TC-OI-29 always yields an item — a month cell is always collectable", () => {
    const cases = [
      { charge: null, collected: 0 },
      { charge: bill("2026-03-01", 0).charge, collected: 0 },
      { charge: bill("2026-03-01", 5).charge, collected: 5 },
    ];

    for (const entry of cases) {
      expect(
        monthItemFromEntry({
          ...ENTRY,
          entry: { ...entry, billingMonth: "2026-03-01" },
        }),
      ).not.toBeNull();
    }
  });
});

describe("TC-OI-30..33 — finding the bill for a month", () => {
  it("TC-OI-30 returns the bill whose month matches", () => {
    const jan = bill("2026-01-01", 0);
    const feb = bill("2026-02-01", 0);

    expect(billForMonth([jan, feb], "2026-02-01")).toBe(feb);
  });

  it("TC-OI-31 a month with no bill returns null, never undefined", () => {
    expect(billForMonth([bill("2026-01-01", 0)], "2026-05-01")).toBeNull();
  });

  it("TC-OI-32 an empty list returns null", () => {
    expect(billForMonth([], "2026-01-01")).toBeNull();
  });

  it("TC-OI-33 matches the month EXACTLY — a bare month is not a date", () => {
    expect(billForMonth([bill("2026-01-01", 0)], "2026-01")).toBeNull();
  });
});
