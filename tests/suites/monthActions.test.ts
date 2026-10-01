import type {
  Customer,
  CustomerPlan,
  MonthBill,
  MonthEntry,
  SkippedMonth,
} from "@shared/core/types";
import {
  billVoidMonths,
  canQuickPayMonth,
  monthMenuItems,
  monthSelectionGroups,
  monthSelectionItems,
  monthTap,
  quickPayLinkAction,
  voidOrderBlocker,
  type LineGates,
  type MonthMenuViewer,
} from "@shared/modules/customer/customer-payments/utils/monthActions";
import {
  cellBadge,
  cellJoins,
} from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import {
  lineIndicator,
  yearSummary,
} from "@shared/modules/customer/customer-payments/utils/gridSummary";
import { applySelectionChange } from "@shared/modules/customer/customer-payments/utils/monthSelection";
import { lastBillableMonth } from "@shared/modules/customer/customer-payments/utils/payWindow";
import { buildGridsFor } from "@shared/state/slices/payments/utils/buildGrids";
import { bill, customer, line, plan, skip } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-MA-* — the month grid doors both apps run (tap, menu, selection, link).
const LINE = line({ id: "line-1", startDate: "2026-01-01", plan: plan({ id: "p1" }) });

const STAFF: MonthMenuViewer = { isAdmin: false, isFixed: true, canSend: true };
const ADMIN: MonthMenuViewer = { ...STAFF, isAdmin: true };

interface Setup {
  grid: MonthEntry[];
  gates: LineGates;
}

function setup(
  bills: MonthBill[] = [],
  skips: SkippedMonth[] = [],
  opts: { who?: Customer; on?: CustomerPlan; year?: number } = {},
): Setup {
  const on = opts.on ?? LINE;
  const derived = buildGridsFor([on], bills, skips, opts.year ?? 2026, "month_start");
  return {
    grid: derived.grids[on.id],
    gates: {
      payLimit: lastBillableMonth(opts.who ?? customer(), on),
      uncoveredMonths: derived.uncoveredMonths[on.id],
      paidMonths: derived.paidMonths[on.id],
    },
  };
}

function month(s: Setup, m: number): MonthEntry {
  return s.grid[m - 1];
}

function keys(items: { key: string }[]): string[] {
  return items.map((i) => i.key);
}

beforeEach(() => freezeToday(2026, 6, 15));
afterEach(unfreeze);

describe("monthTap: what a click on a cell does", () => {
  it("TC-MA-01 a month before the line starts explains itself", () => {
    const s = setup([], [], { on: line({ id: "line-1", startDate: "2026-04-01" }) });
    expect(monthTap(month(s, 2), s.gates)).toEqual({ kind: "before_start" });
  });

  it("TC-MA-02 the oldest unpaid month opens the collect form", () => {
    const s = setup();
    expect(monthTap(month(s, 1), s.gates)).toEqual({ kind: "collect" });
  });

  it("TC-MA-03 a later month is refused while an earlier one is uncovered", () => {
    const s = setup();
    expect(monthTap(month(s, 3), s.gates)).toEqual({
      kind: "pay_order",
      month: "2026-01-01",
    });
  });

  it("TC-MA-04 a month money reached opens its bill", () => {
    const s = setup([bill("2026-01-01", 20)]);
    expect(monthTap(month(s, 1), s.gates)).toEqual({ kind: "bill" });
  });

  it("TC-MA-05 a written-off month with no money still opens the BILL, never collect (#152)", () => {
    const s = setup([
      bill("2026-01-01", 0, { writtenOffAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(month(s, 1).status).toBe("unpaid");
    expect(monthTap(month(s, 1), s.gates)).toEqual({ kind: "bill" });
  });

  it("TC-MA-06 a skip with nothing paid after it is unskipped on click", () => {
    const s = setup([], [skip("2026-01-01")]);
    expect(monthTap(month(s, 1), s.gates)).toEqual({ kind: "unskip" });
  });

  it("TC-MA-07 a skip locked by a later paid month is collected instead (#84)", () => {
    const s = setup([bill("2026-02-01", 20)], [skip("2026-01-01")]);
    expect(monthTap(month(s, 1), s.gates)).toEqual({ kind: "collect" });
  });

  it("TC-MA-08 a cancelled line refuses months after it stopped", () => {
    const stopped = line({
      id: "line-1",
      startDate: "2026-01-01",
      active: false,
      cancelledAt: "2026-03-10T00:00:00.000Z",
    });
    const s = setup([bill("2026-01-01", 20), bill("2026-02-01", 20), bill("2026-03-01", 20)], [], {
      on: stopped,
    });
    expect(monthTap(month(s, 4), s.gates)).toEqual({ kind: "pay_limit" });
  });
});

describe("monthMenuItems: the ⋮ menu of one month", () => {
  it("TC-MA-10 an open priced month offers pay, pay + send, part pay and skip", () => {
    const s = setup();
    expect(keys(monthMenuItems(month(s, 1), s.gates, STAFF))).toEqual([
      "open",
      "quick-pay",
      "quick-pay-whatsapp",
      "collect-part",
      "skip",
    ]);
  });

  it("TC-MA-11 a line with no set price asks for the amount and has no part pay", () => {
    const s = setup();
    const items = monthMenuItems(month(s, 1), s.gates, { ...STAFF, isFixed: false });
    expect(keys(items)).not.toContain("collect-part");
    expect(items.find((i) => i.key === "quick-pay")?.captionKey).toBe(
      "payments.quick_pay.type_amount",
    );
  });

  it("TC-MA-12 no phone number keeps pay + send visible but disabled", () => {
    const s = setup();
    const send = monthMenuItems(month(s, 1), s.gates, { ...STAFF, canSend: false }).find(
      (i) => i.key === "quick-pay-whatsapp",
    );
    expect(send).toMatchObject({ disabled: true, captionKey: "invoice.no_phone" });
  });

  it("TC-MA-13 a blocked later month offers no pay rows, only skip", () => {
    const s = setup();
    expect(keys(monthMenuItems(month(s, 3), s.gates, STAFF))).toEqual(["open", "skip"]);
  });

  it("TC-MA-14 a part-paid month offers its bill, the rest, and the void", () => {
    const s = setup([bill("2026-01-01", 5)]);
    expect(keys(monthMenuItems(month(s, 1), s.gates, ADMIN))).toEqual([
      "open",
      "bill",
      "collect-remaining",
      "history",
      "void-month",
    ]);
  });

  it("TC-MA-15 a written-off month hides 'collect the rest'", () => {
    const s = setup([bill("2026-01-01", 5, { writtenOffAt: "2026-02-01T00:00:00.000Z" })]);
    expect(keys(monthMenuItems(month(s, 1), s.gates, STAFF))).not.toContain(
      "collect-remaining",
    );
  });

  it("TC-MA-16 history is admin-only and never on a month before the start", () => {
    const s = setup([], [], { on: line({ id: "line-1", startDate: "2026-04-01" }) });
    expect(keys(monthMenuItems(month(s, 2), s.gates, ADMIN))).toEqual(["open"]);
    expect(keys(monthMenuItems(month(s, 4), s.gates, STAFF))).not.toContain("history");
    expect(keys(monthMenuItems(month(s, 4), s.gates, ADMIN))).toContain("history");
  });

  it("TC-MA-17 a locked skip offers pay rows and no unskip", () => {
    const s = setup([bill("2026-02-01", 20)], [skip("2026-01-01")]);
    const items = keys(monthMenuItems(month(s, 1), s.gates, STAFF));
    expect(items).toContain("quick-pay");
    expect(items).not.toContain("unskip");
    expect(canQuickPayMonth(month(s, 1), s.gates)).toBe(true);
  });
});

describe("selection: several months at once", () => {
  it("TC-MA-20 a part-paid month joins the payable group; a fully paid one never does", () => {
    const s = setup([bill("2026-01-01", 20), bill("2026-02-01", 5)]);
    const groups = monthSelectionGroups([month(s, 1), month(s, 2), month(s, 3)], s.gates);
    expect(groups.payable.map((e) => e.billingMonth)).toEqual(["2026-02-01", "2026-03-01"]);
    expect(groups.skippable.map((e) => e.billingMonth)).toEqual(["2026-03-01"]);
    expect(groups.skipped).toEqual([]);
  });

  it("TC-MA-21 the toolbar offers pay + send only when the customer has a phone", () => {
    const s = setup([], [skip("2026-05-01")]);
    const groups = monthSelectionGroups([month(s, 1), month(s, 5)], s.gates);
    expect(keys(monthSelectionItems(groups, true))).toEqual([
      "pay",
      "pay-whatsapp",
      "skip",
      "unskip",
    ]);
    expect(keys(monthSelectionItems(groups, false))).toEqual(["pay", "skip", "unskip"]);
  });

  it("TC-MA-22 a ticked checkbox brings its whole bundle; unticking drops it whole", () => {
    const units: Record<string, string[]> = {
      "2026-01-01": ["2026-01-01", "2026-02-01", "2026-03-01"],
      "2026-02-01": ["2026-01-01", "2026-02-01", "2026-03-01"],
      "2026-03-01": ["2026-01-01", "2026-02-01", "2026-03-01"],
      "2026-04-01": ["2026-04-01"],
    };
    const unitOf = (m: string) => units[m] ?? [];
    const picked = applySelectionChange(new Set(), new Set(["2026-02-01"]), unitOf);
    expect(picked.sort()).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    const more = applySelectionChange(new Set(picked), new Set([...picked, "2026-04-01"]), unitOf);
    expect(more).toHaveLength(4);
    const dropped = applySelectionChange(
      new Set(more),
      new Set(["2026-01-01", "2026-02-01", "2026-04-01"]),
      unitOf,
    );
    expect(dropped).toEqual(["2026-04-01"]);
  });
});

describe("quickPayLinkAction: the ?quickPay=1 door", () => {
  it("TC-MA-25 this month opens the collect form when nothing older is open", () => {
    const s = setup([1, 2, 3, 4, 5].map((m) => bill(`2026-0${m}-01`, 20)));
    expect(quickPayLinkAction(month(s, 6), s.gates)).toEqual({ kind: "collect" });
  });

  it("TC-MA-26 an older uncovered month is named instead", () => {
    const s = setup();
    expect(quickPayLinkAction(month(s, 6), s.gates)).toEqual({
      kind: "pay_order",
      month: "2026-01-01",
    });
  });

  it("TC-MA-27 a skipped current month is refused", () => {
    const s = setup([1, 2, 3, 4, 5].map((m) => bill(`2026-0${m}-01`, 20)), [skip("2026-06-01")]);
    expect(quickPayLinkAction(month(s, 6), s.gates)).toEqual({ kind: "skipped" });
  });
});

describe("voiding a month bill runs newest first", () => {
  it("TC-MA-30 a bundle is judged by every month it covers", () => {
    const b = bill("2026-02-01", 60, { durationMonths: 3, amount: 60 });
    expect(billVoidMonths(b.charge, "2026-02-01")).toEqual([
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    const s = setup([bill("2026-01-01", 20), b]);
    expect(voidOrderBlocker(s.gates, ["2026-01-01"])).toBe("2026-04-01");
    expect(voidOrderBlocker(s.gates, billVoidMonths(b.charge, "2026-02-01"))).toBeNull();
  });
});

describe("cell layout", () => {
  it("TC-MA-35 one bundle reads as one pill, wrapping at the row end", () => {
    const s = setup([bill("2026-01-01", 20), bill("2026-02-01", 20), bill("2026-03-01", 20), bill("2026-04-01", 60, { durationMonths: 3, amount: 60 })]);
    const joins = cellJoins(s.grid, 4);
    expect(joins[3]).toMatchObject({ joinStart: false, joinEnd: false, wrapToNext: true });
    expect(joins[4]).toMatchObject({ joinStart: false, joinEnd: true, wrapFromPrev: true });
    expect(joins[5]).toMatchObject({ joinStart: true, joinEnd: false });
    expect(cellJoins(s.grid, 6)[3]).toMatchObject({ joinEnd: true, wrapToNext: false });
  });

  it("TC-MA-36 the cell badge: included, partial, paid, skipped, this month", () => {
    const s = setup(
      [bill("2026-01-01", 40, { durationMonths: 2, amount: 40 }), bill("2026-03-01", 5)],
      [skip("2026-04-01")],
    );
    expect(cellBadge(month(s, 1))).toBe("paid");
    expect(cellBadge(month(s, 2))).toBe("included");
    expect(cellBadge(month(s, 3))).toBe("partial");
    expect(cellBadge(month(s, 4))).toBe("skipped");
    expect(cellBadge(month(s, 5))).toBeNull();
    expect(cellBadge(month(s, 6))).toBe("this_month");
  });
});

describe("year card facts", () => {
  it("TC-MA-40 collected is summed in USD at each bill's own rate", () => {
    const bills = [
      bill("2026-01-01", 20),
      bill("2026-02-01", 900000, { amount: 900000, ratePerUsdSnapshot: 90000 }),
      bill("2025-12-01", 20),
    ];
    const s = setup(bills);
    expect(yearSummary(s.grid, bills, "line-1", 2026)).toEqual({
      paid: 2,
      unpaid: 4,
      skipped: 0,
      collectedUsd: 30,
    });
  });

  it("TC-MA-41 the line dot: any unpaid month wins, nothing due = no dot", () => {
    expect(lineIndicator(setup([bill("2026-01-01", 20)]).grid)).toBe("unpaid");
    const paidUp = setup([1, 2, 3, 4, 5, 6].map((m) => bill(`2026-0${m}-01`, 20)));
    expect(lineIndicator(paidUp.grid)).toBe("paid");
    const later = setup([], [], { on: line({ id: "line-1", startDate: "2027-01-01" }) });
    expect(lineIndicator(later.grid)).toBeNull();
  });
});
