import type { LinePriceChange, PlanPriceChange } from "@shared/core/types";
import planService from "@shared/modules/admin/plans/services/PlanService";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import {
  rowPriceChanged,
  type LineRow,
} from "@shared/modules/customer/customer-plans/utils/lineDrafts";
import { resolveLinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import { earlierPriceNotes } from "@shared/modules/ledger/utils/earlierPriceNotes";
import {
  EMPTY_PRICE_HISTORY,
  isEarlierPrice,
  linePriceAt,
  priceHistoryOf,
  priceStartMonths,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { mergeOwed } from "@shared/modules/ledger/utils/mergeOwed";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import { priceStore } from "../helpers/fakePriceHistory";
import { store } from "../helpers/fakeLedger";
import { bill, customer, line, plan, LBP } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-PH-* — a month is priced as it stood IN that month — gotcha #185.
const P = plan({ id: "p1", price: 20 });
const L = line({ id: "line-1", planId: "p1", plan: P, startDate: "2026-01-01" });

function planEdit(over: Partial<PlanPriceChange>): PlanPriceChange {
  return {
    id: `pc-${over.fromMonth ?? "first"}-${over.createdAt ?? "0"}`,
    planId: "p1",
    fromMonth: null,
    price: 20,
    currencyId: null,
    durationMonths: 1,
    isCustomPrice: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function lineEdit(over: Partial<LinePriceChange>): LinePriceChange {
  return {
    id: `lc-${over.fromMonth ?? "first"}-${over.createdAt ?? "0"}`,
    customerId: "cust-1",
    customerPlanId: "line-1",
    fromMonth: null,
    planId: "p1",
    customPrice: null,
    customCurrencyId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const amountAt = (month: string, history = EMPTY_PRICE_HISTORY, l = L) =>
  linePriceAt(l, month, history).amount;

describe("linePriceAt", () => {
  it("TC-PH-01 no edits -> today`s price for every month (existing customers)", () => {
    expect(amountAt("2025-06-01")).toBe(20);
    expect(amountAt("2026-09-01")).toBe(20);
  });

  it("TC-PH-02 a plan raise only reaches months from its start month on", () => {
    const history = priceHistoryOf({
      planChanges: [
        planEdit({ price: 20 }),
        planEdit({ fromMonth: "2026-03-01", price: 25, createdAt: "2026-03-05T00:00:00.000Z" }),
      ],
      lineChanges: [],
      plans: [],
    });
    const raised = line({ ...L, plan: plan({ id: "p1", price: 25 }) });
    expect(amountAt("2026-01-01", history, raised)).toBe(20);
    expect(amountAt("2026-02-01", history, raised)).toBe(20);
    expect(amountAt("2026-03-01", history, raised)).toBe(25);
    expect(amountAt("2026-08-01", history, raised)).toBe(25);
  });

  it("TC-PH-03 a LATER edit dated earlier wins every month it reaches", () => {
    const history = priceHistoryOf({
      planChanges: [
        planEdit({ price: 20 }),
        planEdit({ fromMonth: "2026-03-01", price: 25, createdAt: "2026-03-05T00:00:00.000Z" }),
        planEdit({ fromMonth: "2026-02-01", price: 30, createdAt: "2026-04-02T00:00:00.000Z" }),
      ],
      lineChanges: [],
      plans: [],
    });
    expect(amountAt("2026-01-01", history)).toBe(20);
    expect(amountAt("2026-02-01", history)).toBe(30);
    expect(amountAt("2026-03-01", history)).toBe(30);
    expect(amountAt("2026-05-01", history)).toBe(30);
  });

  it("TC-PH-04 amount, currency and months covered travel together (#85)", () => {
    const history = priceHistoryOf({
      planChanges: [
        planEdit({ price: 900000, currencyId: LBP.id, durationMonths: 3 }),
        planEdit({ fromMonth: "2026-04-01", price: 20, createdAt: "2026-04-01T00:00:00.000Z" }),
      ],
      lineChanges: [],
      plans: [],
    });
    expect(linePriceAt(L, "2026-01-01", history)).toMatchObject({
      amount: 900000,
      currencyId: LBP.id,
      durationMonths: 3,
    });
    expect(linePriceAt(L, "2026-04-01", history)).toMatchObject({
      amount: 20,
      currencyId: null,
      durationMonths: 1,
    });
  });

  it("TC-PH-05 a special-price edit is per line and beats the plan price", () => {
    const special = line({ ...L, customPrice: 18 });
    const history = priceHistoryOf({
      planChanges: [],
      lineChanges: [
        lineEdit({ customPrice: 15 }),
        lineEdit({ fromMonth: "2026-03-01", customPrice: 18, createdAt: "2026-03-02T00:00:00.000Z" }),
      ],
      plans: [],
    });
    expect(amountAt("2026-02-01", history, special)).toBe(15);
    expect(amountAt("2026-03-01", history, special)).toBe(18);
  });

  it("TC-PH-06 a line moved to another plan keeps the OLD plan`s price before the move", () => {
    const moved = line({ ...L, planId: "p2", plan: plan({ id: "p2", price: 40 }) });
    const history = priceHistoryOf({
      planChanges: [],
      lineChanges: [
        lineEdit({ planId: "p1" }),
        lineEdit({ fromMonth: "2026-04-01", planId: "p2", createdAt: "2026-04-01T00:00:00.000Z" }),
      ],
      plans: [P],
    });
    expect(amountAt("2026-03-01", history, moved)).toBe(20);
    expect(amountAt("2026-04-01", history, moved)).toBe(40);
  });

  it("TC-PH-07 the old plan`s own raise still applies to the months the line was on it", () => {
    const moved = line({ ...L, planId: "p2", plan: plan({ id: "p2", price: 40 }) });
    const history = priceHistoryOf({
      planChanges: [
        planEdit({ price: 20 }),
        planEdit({ fromMonth: "2026-02-01", price: 22, createdAt: "2026-05-01T00:00:00.000Z" }),
      ],
      lineChanges: [
        lineEdit({ planId: "p1" }),
        lineEdit({ fromMonth: "2026-04-01", planId: "p2", createdAt: "2026-04-01T00:00:00.000Z" }),
      ],
      plans: [plan({ id: "p1", price: 22 })],
    });
    expect(amountAt("2026-01-01", history, moved)).toBe(20);
    expect(amountAt("2026-03-01", history, moved)).toBe(22);
    expect(amountAt("2026-04-01", history, moved)).toBe(40);
  });
});

describe("mergeOwed with price history", () => {
  beforeEach(() => freezeToday(2026, 4, 15));
  afterEach(unfreeze);

  const raised = line({ ...L, plan: plan({ id: "p1", price: 25 }) });
  const history = priceHistoryOf({
    planChanges: [
      planEdit({ price: 20 }),
      planEdit({ fromMonth: "2026-03-01", price: 25, createdAt: "2026-03-05T00:00:00.000Z" }),
    ],
    lineChanges: [],
    plans: [],
  });

  const owed = (stored = [] as ReturnType<typeof openItemFromCharge>[], bills = [] as ReturnType<typeof bill>[]) =>
    mergeOwed({
      customer: customer({ customerPlans: [raised] }),
      lines: [raised],
      skips: [],
      unpaidRule: "month_start",
      currencies: [LBP],
      stored,
      billsByLine: new Map([["line-1", bills]]),
      prices: history,
    });

  it("TC-PH-08 old unpaid months owe the OLD price after a raise", () => {
    expect(owed().map((i) => [i.billingMonth, i.amount])).toEqual([
      ["2026-01-01", 20],
      ["2026-02-01", 20],
      ["2026-03-01", 25],
      ["2026-04-01", 25],
    ]);
  });

  it("TC-PH-09 a month whose only payment was voided owes its OWN month`s price", () => {
    const emptied = bill("2026-02-01", 0, { amount: 25 });
    const stored = [openItemFromCharge(emptied.charge, 0, "Feb 2026")];
    const feb = owed(stored, [emptied]).find((i) => i.billingMonth === "2026-02-01");
    expect(feb?.amount).toBe(20);
    expect(feb?.chargeId).toBeNull();
  });

  it("TC-PH-19 only months priced unlike today are flagged earlierPrice", () => {
    expect(owed().map((i) => [i.billingMonth, i.earlierPrice])).toEqual([
      ["2026-01-01", true],
      ["2026-02-01", true],
      ["2026-03-01", false],
      ["2026-04-01", false],
    ]);
  });

  it("TC-PH-20 the collect form names the old price once per price, months oldest first", () => {
    const notes = earlierPriceNotes([...owed()].reverse(), [LBP]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("ledger.earlier_price_note");
    expect(notes[0]).toContain("months_long.jan 2026, months_long.feb 2026");
    expect(notes[0]).toContain("$20.00");
  });

  it("TC-PH-21 an unpriced month is never flagged", () => {
    const typed = resolveLinePrice({ customPrice: null, customCurrencyId: null, plan: null });
    expect(isEarlierPrice(typed, linePriceAt(L, "2026-01-01", EMPTY_PRICE_HISTORY))).toBe(false);
  });

  it("TC-PH-10 a month money reached keeps its bill amount", () => {
    const paid = bill("2026-01-01", 5, { amount: 18 });
    const stored = [openItemFromCharge(paid.charge, 5, "Jan 2026")];
    const jan = owed(stored, [paid]).find((i) => i.billingMonth === "2026-01-01");
    expect(jan?.amount).toBe(18);
    expect(jan?.balance).toBe(13);
  });
});

describe("recording a price edit", () => {
  beforeEach(() => {
    priceStore.reset();
    freezeToday(2026, 4, 15);
  });
  afterEach(unfreeze);

  const saved = () => {
    priceStore.catalog = [
      {
        id: "p1",
        name: "Internet",
        price: 20,
        is_custom_price: false,
        duration_months: 1,
        currency_id: null,
        branch_id: null,
        tenant_id: "t1",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    return plan({ id: "p1", price: 20 });
  };
  const input = (price: number) => ({
    name: "Internet",
    isCustomPrice: false,
    price,
    durationMonths: 1,
    currencyId: null,
    branchId: null,
  });

  it("TC-PH-11 a plan price edit keeps the old price, then adds the new one from the chosen month", async () => {
    const updated = await planService.updatePlan(saved(), input(25), "2026-02-01");
    expect(updated.price).toBe(25);
    const rows = priceStore.plans.map((r) => [r.from_month, Number(r.price)]);
    expect(rows).toEqual([
      [null, 20],
      ["2026-02-01", 25],
    ]);
  });

  it("TC-PH-12 a second edit never rewrites the first-price row", async () => {
    const first = await planService.updatePlan(saved(), input(25), "2026-04-01");
    jest.advanceTimersByTime(60_000);
    await planService.updatePlan(first, input(30), "2026-04-01");
    expect(priceStore.plans.filter((r) => r.from_month === null).map((r) => Number(r.price))).toEqual([20]);
    const history = await priceHistoryService.getForLines([{ id: "line-1", planId: "p1" }]);
    const now = line({ ...L, plan: plan({ id: "p1", price: 30 }) });
    expect(linePriceAt(now, "2026-03-01", history).amount).toBe(20);
    expect(linePriceAt(now, "2026-04-01", history).amount).toBe(30);
  });

  it("TC-PH-13 a name-only edit records no price change", async () => {
    await planService.updatePlan(saved(), { ...input(20), name: "Fiber" });
    expect(priceStore.plans).toEqual([]);
  });

  it("TC-PH-14 a new price can never start in a future month", async () => {
    await expect(planService.updatePlan(saved(), input(25), "2026-05-01")).rejects.toThrow();
    expect(priceStore.plans).toEqual([]);
    expect(priceStore.catalog[0].price).toBe(20);
  });

  it("TC-PH-18 getOwed (collect sheet, reminders, dashboard) reads the stored edits", async () => {
    const first = await planService.updatePlan(saved(), input(25), "2026-03-01");
    store.reset();
    const now = line({ ...L, plan: first });
    const owed = await ledgerService.getOwed({
      customer: customer({ customerPlans: [now] }),
      lines: [now],
      skips: [],
      unpaidRule: "month_start",
      currencies: [LBP],
    });
    expect(owed.map((i) => [i.billingMonth, i.amount])).toEqual([
      ["2026-01-01", 20],
      ["2026-02-01", 20],
      ["2026-03-01", 25],
      ["2026-04-01", 25],
    ]);
  });

  it("TC-PH-15 a line edit records the line`s old special price and its plan", async () => {
    const before = line({ ...L, customPrice: 15 });
    await priceHistoryService.recordLineChange(
      before,
      { planId: "p1", customPrice: 18, customCurrencyId: null },
      "2026-03-01",
    );
    const history = await priceHistoryService.getForLines([{ id: "line-1", planId: "p1" }]);
    const after = line({ ...L, customPrice: 18 });
    expect(amountAt("2026-02-01", history, after)).toBe(15);
    expect(amountAt("2026-03-01", history, after)).toBe(18);
  });
});

describe("the price-start picker", () => {
  beforeEach(() => freezeToday(2026, 2, 10));
  afterEach(unfreeze);

  it("TC-PH-16 offers this month first, then earlier months, never a future one", () => {
    const months = priceStartMonths();
    expect(months[0]).toBe("2026-02-01");
    expect(months[1]).toBe("2026-01-01");
    expect(months[2]).toBe("2025-12-01");
    expect(months).toHaveLength(12);
  });

  const row = (over: Partial<LineRow>): LineRow => ({
    key: "line-1",
    id: "line-1",
    planId: "p1",
    startDate: "2026-01-01",
    customPrice: null,
    customCurrencyId: null,
    status: "active",
    ...over,
  });

  it("TC-PH-17 shows only when a SAVED active line`s price, currency or plan changed", () => {
    const initial = [row({})];
    expect(rowPriceChanged(initial, row({}))).toBe(false);
    expect(rowPriceChanged(initial, row({ startDate: "2026-02-01" }))).toBe(false);
    expect(rowPriceChanged(initial, row({ customPrice: 18 }))).toBe(true);
    expect(rowPriceChanged(initial, row({ planId: "p2" }))).toBe(true);
    expect(rowPriceChanged(initial, row({ customPrice: 0 }))).toBe(false);
    expect(rowPriceChanged([row({ status: "cancelled" })], row({ customPrice: 18 }))).toBe(false);
    expect(rowPriceChanged([], row({ key: "new-1", id: undefined, customPrice: 18 }))).toBe(false);
  });
});
