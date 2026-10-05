import type { MonthEntry } from "@shared/core/types";
import { usageOf, freeLineCount, monthlyAmountText } from "@shared/modules/admin/billing/utils/usage";
import {
  hasMonthMoney,
  isSelectableMonth,
  monthBillFigure,
  monthCellTone,
  monthNoteOf,
  monthOwedFigure,
  monthPaidFigure,
  monthRowEmphasis,
  monthRowStatus,
  monthRowStatusTone,
} from "@shared/modules/customer/customer-payments/utils/monthView";
import type { LinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import {
  allocationRows,
  collectBlocker,
  overByText,
} from "@shared/modules/ledger/utils/allocationRows";
import { collectionItemLabel } from "@shared/modules/ledger/utils/collectionLabel";
import {
  coversOtherBills,
  heldByLabel,
  isHeldByCollector,
  isPaymentVoided,
} from "@shared/modules/ledger/utils/collectionView";
import { stillOwedAfter, type CurrencyPlan } from "@shared/modules/ledger/utils/currencyGroups";
import { keyOf, linesTotal } from "@shared/modules/ledger/utils/waterfall";
import {
  HISTORY_OUTCOME_TONE,
  historyPeriodLabelKey,
  isDeadHistoryRow,
  laterPaidOf,
} from "@shared/modules/transaction/debts/utils/debtHistory";
import { buildGridsFor } from "@shared/state/slices/payments/utils/buildGrids";
import { bill, charge, collection, collectionItem, line, openItem, plan } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-DR-* — the display rules both apps used to decide inside their components.

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key) as (key: string, opts?: Record<string, unknown>) => string;

const LINE = line({ id: "line-1", startDate: "2026-01-01", plan: plan({ id: "p1" }) });

function grid(bills = [bill("2026-01-01", 20)]): MonthEntry[] {
  return buildGridsFor([LINE], bills, [], 2026, "month_start").grids[LINE.id];
}

function month(entries: MonthEntry[], m: number): MonthEntry {
  return entries[m - 1];
}

const FIXED: LinePrice = { amount: 20, currencyId: null, durationMonths: 1, isFixed: true, kind: "plan" };

beforeEach(() => freezeToday(2026, 6, 15));
afterEach(unfreeze);

describe("usage meter", () => {
  it("TC-DR-01 amber from 80%, red once full or when nothing is allowed", () => {
    expect(usageOf(7, 10).level).toBe("ok");
    expect(usageOf(8, 10).level).toBe("near");
    expect(usageOf(10, 10)).toMatchObject({ level: "full", full: true, remaining: 0, percent: 100 });
    expect(usageOf(0, 0).level).toBe("full");
  });

  it("TC-DR-02 an over-full allowance never shows negative room or a bar past 100%", () => {
    expect(usageOf(12, 10)).toMatchObject({ remaining: 0, percent: 100 });
    expect(freeLineCount({ customers: 5, plans: 5 }, { customers: 5, plans: 9 })).toBe(0);
    expect(freeLineCount({ customers: 5, plans: 8 }, { customers: 2, plans: 3 })).toBe(5);
  });

  it("TC-DR-03 the monthly amount prints as dollars with two decimals", () => {
    expect(monthlyAmountText(4, 2.5)).toBe("$10.00");
  });
});

describe("month cells and rows", () => {
  it("TC-DR-04 a regular customer's current unpaid month has its own look", () => {
    const g = grid([]);
    expect(monthCellTone(month(g, 6), true)).toBe("current_unpaid");
    expect(monthCellTone(month(g, 5), true)).toBe("unpaid");
    expect(monthCellTone(month(g, 6), false)).toBe("unpaid_irregular");
  });

  it("TC-DR-05 paid, future and before-start months keep their own tone", () => {
    const g = grid();
    expect(monthCellTone(month(g, 1), true)).toBe("paid");
    expect(monthCellTone(month(g, 1), false)).toBe("paid_irregular");
    expect(monthCellTone(month(g, 9), true)).toBe("future");
    const late = buildGridsFor([line({ id: "line-1", startDate: "2026-04-01" })], [], [], 2026, "month_start");
    const before = late.grids["line-1"][0];
    expect(monthCellTone(before, true)).toBe("before_start");
    expect(isSelectableMonth(before)).toBe(false);
    expect(monthRowEmphasis(before)).toBe("muted");
  });

  it("TC-DR-06 a write-off outranks partial, and partial outranks paid", () => {
    const partial = month(grid([bill("2026-01-01", 5)]), 1);
    expect(monthRowStatus(partial)).toBe("partial");
    const writtenOff = month(
      grid([bill("2026-01-01", 5, { writtenOffAt: "2026-02-01T00:00:00.000Z" })]),
      1,
    );
    expect(monthRowStatus(writtenOff)).toBe("written_off");
    expect(monthRowStatus(month(grid(), 1))).toBe("paid");
  });

  it("TC-DR-07 a non-regular customer's unpaid month is grey, not red", () => {
    expect(monthRowStatusTone("unpaid", true)).toBe("red");
    expect(monthRowStatusTone("unpaid", false)).toBe("gray");
    expect(monthRowStatusTone("written_off", false)).toBe("orange");
  });

  it("TC-DR-08 the current month is highlighted in the list", () => {
    expect(monthRowEmphasis(month(grid([]), 6))).toBe("highlighted");
    expect(monthRowEmphasis(month(grid([]), 5))).toBeNull();
  });

  it("TC-DR-09 a paid month shows its bill; an unpaid one shows a one-month fixed price", () => {
    const g = grid();
    expect(monthBillFigure(month(g, 1), FIXED)).toMatchObject({ from: "bill" });
    expect(monthBillFigure(month(g, 3), FIXED)).toEqual({ from: "line", amount: 20, currencyId: null });
    expect(monthBillFigure(month(g, 3), { ...FIXED, durationMonths: 3 })).toBeNull();
    expect(monthBillFigure(month(g, 3), { ...FIXED, isFixed: false, amount: null })).toBeNull();
  });

  it("TC-DR-10 paid and owed figures appear only once money reached the bill", () => {
    const partial = month(grid([bill("2026-01-01", 5, { amount: 20 })]), 1);
    expect(hasMonthMoney(partial)).toBe(true);
    expect(monthPaidFigure(partial)?.amount).toBe(5);
    expect(monthOwedFigure(partial)?.amount).toBe(15);
    const untouched = month(grid([]), 2);
    expect(monthPaidFigure(untouched)).toBeNull();
    expect(monthOwedFigure(untouched)).toBeNull();
  });

  it("TC-DR-11 a written-off month owes nothing on the list", () => {
    const writtenOff = month(
      grid([bill("2026-01-01", 5, { amount: 20, writtenOffAt: "2026-02-01T00:00:00.000Z" })]),
      1,
    );
    expect(monthOwedFigure(writtenOff)).toBeNull();
  });

  it("TC-DR-12 a bundle's first month says what it covers, the rest say which bill", () => {
    const g = grid([bill("2026-01-01", 60, { amount: 60, durationMonths: 3 })]);
    expect(monthNoteOf(month(g, 1))).toEqual({ kind: "covers", startMonth: "2026-01-01", durationMonths: 3 });
    expect(monthNoteOf(month(g, 2))).toMatchObject({ kind: "in_bill" });
    expect(monthBillFigure(month(g, 2), FIXED)).toBeNull();
  });
});

describe("collect preview", () => {
  const a = openItem({ chargeId: "a", balance: 10, amount: 10, dueDate: "2026-01-01" });
  const b = openItem({ chargeId: "b", balance: 10, amount: 10, dueDate: "2026-02-01" });
  const c = openItem({ chargeId: "c", balance: 10, amount: 10, dueDate: "2026-03-01" });

  it("TC-DR-13 the queue number counts only bills still in the pool", () => {
    const rows = allocationRows([a, b, c], [], new Set([keyOf(b)]));
    expect(rows.map((r) => r.position)).toEqual([1, null, 2]);
    expect(rows[1]).toMatchObject({ status: "skipped", tone: "gray", statusKey: "ledger.skipped_bill" });
  });

  it("TC-DR-14 a filled bill pays in full, a part-filled one leaves the rest owing", () => {
    const lines = [
      { item: a, amount: 10, settles: true },
      { item: b, amount: 4, settles: false },
    ];
    const rows = allocationRows([a, b, c], lines, new Set());
    expect(rows[0]).toMatchObject({ status: "pays_in_full", tone: "emerald" });
    expect(rows[1]).toMatchObject({ status: "leaves_owing", tone: "amber", leavesOwing: 6 });
    expect(rows[2]).toMatchObject({ status: null, line: null, position: 3 });
  });

  it("TC-DR-15 what is still owed after never goes below zero", () => {
    const plan = { owed: 20, lines: [{ item: a, amount: 10, settles: true }] } as CurrencyPlan;
    expect(stillOwedAfter(plan)).toBe(10);
    expect(stillOwedAfter({ ...plan, owed: 5 })).toBe(0);
    expect(linesTotal(plan.lines)).toBe(10);
  });

  it("TC-DR-16 an overpay names the most that can be taken, and the skipped bills", () => {
    const money = (v: number) => `$${v}`;
    expect(overByText({ leftover: 0, skippedCount: 0, payable: 20 }, money, t)).toBeNull();
    expect(overByText({ leftover: 5, skippedCount: 0, payable: 20 }, money, t)).toBe('ledger.over_by {"max":"$20"}');
    expect(overByText({ leftover: 5, skippedCount: 2, payable: 20 }, money, t)).toBe(
      'ledger.over_by_skipped {"count":2,"max":"$20"}',
    );
  });

  it("TC-DR-17 Save explains why it is off", () => {
    const pool = { overpaying: false };
    const single = (over: object) => ({
      plan: { overpaying: false },
      item: { openAmount: false },
      openBill: null,
      ...over,
    });
    expect(collectBlocker({ single: null, pool })).toBe("type_amount");
    expect(collectBlocker({ single: null, pool: { overpaying: true } })).toBe("lower_amount");
    expect(collectBlocker({ single: single({ plan: { overpaying: true } }), pool })).toBe("lower_amount");
    expect(collectBlocker({ single: single({ item: { openAmount: true } }), pool })).toBe("type_month_amount");
    expect(collectBlocker({ single: single({ item: { openAmount: true }, openBill: 20 }), pool })).toBe("type_amount");
  });
});

describe("payments and custody", () => {
  it("TC-DR-18 banked cash says so; cash with a person names them", () => {
    const name = (id: string | null) => (id === "u-2" ? "Sara" : null);
    expect(heldByLabel(collection({ heldByUserId: null }), t, name)).toBe("ledger.banked");
    expect(heldByLabel(collection({ heldByUserId: "u-2" }), t, name)).toBe("Sara");
    expect(heldByLabel(collection({ heldByUserId: "u-9" }), t, name)).toBe("common.unknown");
  });

  it("TC-DR-19 a voided hand-over holds nothing", () => {
    const voided = collection({ voidedAt: "2026-02-02T00:00:00.000Z", heldByUserId: null });
    expect(heldByLabel(voided, t, () => "x")).toBeNull();
  });

  it("TC-DR-20 cash still with its collector is held by the collector; banked cash is not", () => {
    expect(isHeldByCollector(collection({ heldByUserId: "user-1", receivedByUserId: "user-1" }))).toBe(true);
    expect(isHeldByCollector(collection({ heldByUserId: "u-2", receivedByUserId: "user-1" }))).toBe(false);
    expect(isHeldByCollector(collection({ heldByUserId: null, receivedByUserId: "user-1" }))).toBe(false);
  });

  it("TC-DR-21 a voided bill takes every payment on it down with it", () => {
    expect(isPaymentVoided(collection(), true)).toBe(true);
    expect(isPaymentVoided(collection(), false)).toBe(false);
    expect(isPaymentVoided(collection({ voidedAt: "2026-02-02T00:00:00.000Z" }), false)).toBe(true);
  });

  it("TC-DR-22 a payment covers other bills when it paid more than one", () => {
    expect(coversOtherBills(collection({ items: [collectionItem()] }))).toBe(false);
    expect(coversOtherBills(collection({ items: [collectionItem(), collectionItem()] }))).toBe(true);
  });

  it("TC-DR-23 a paid-for line with no label still reads as a payment", () => {
    expect(collectionItemLabel({ itemLabels: ["Jan 2026", ""] }, 0, t)).toBe("Jan 2026");
    expect(collectionItemLabel({ itemLabels: ["Jan 2026", ""] }, 1, t)).toBe("ledger.payment");
    expect(collectionItemLabel({ itemLabels: [] }, 0, t)).toBe("ledger.payment");
  });
});

describe("debt history display", () => {
  const item = (over: object = {}) => ({ ...openItem(), downPaid: 0, settledAt: null, ...over });

  it("TC-DR-24 money paid later excludes the down payment", () => {
    expect(laterPaidOf(item({ paid: 15, downPaid: 5 }))).toBe(10);
  });

  it("TC-DR-25 a written-off row is dimmed and orange", () => {
    const dead = item({ charge: charge({ writtenOffAt: "2026-02-01T00:00:00.000Z" }) });
    expect(isDeadHistoryRow(dead)).toBe(true);
    expect(isDeadHistoryRow(item())).toBe(false);
    expect(HISTORY_OUTCOME_TONE.written_off).toBe("orange");
  });

  it("TC-DR-26 the period filter labels 'all' on its own key", () => {
    expect(historyPeriodLabelKey("all")).toBe("debts.period_all");
    expect(historyPeriodLabelKey("last_month")).toBe("reports.period_last_month");
  });
});
