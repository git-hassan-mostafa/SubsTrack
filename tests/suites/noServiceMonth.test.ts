import type { CustomerPlan, MonthBill, MonthEntry, SkippedMonth } from "@shared/core/types";
import {
  buildCustomerStatus,
  countThisMonth,
  unpaidBillingMonths,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";
import {
  canWriteOffMonth,
  isPayableStatus,
  monthMenuItems,
  monthSelectionGroups,
  monthTap,
  payOrderBlocker,
  type LineGates,
  type MonthMenuViewer,
} from "@shared/modules/customer/customer-payments/utils/monthActions";
import { cellBadge } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import { expandSelectionUnit } from "@shared/modules/customer/customer-payments/utils/monthSelection";
import { monthCellTone } from "@shared/modules/customer/customer-payments/utils/monthView";
import { lastBillableMonth } from "@shared/modules/customer/customer-payments/utils/payWindow";
import { mergeOwed } from "@shared/modules/ledger/utils/mergeOwed";
import { buildGridsFor } from "@shared/state/slices/payments/utils/buildGrids";
import { bill, customer, line, openItem, plan, skip } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-NS-* — a prepaid month with no money is "No service": it owes nothing, never blocks, can still be paid.

const P = plan({ id: "p1", price: 20, prepaid: true });
const PREPAID = line({ id: "line-1", startDate: "2026-01-01", planId: "p1", plan: P, prepaid: true });
const POSTPAID = line({ ...PREPAID, prepaid: false });
const STAFF: MonthMenuViewer = { isAdmin: false, isFixed: true, canSend: true, usageEntry: null };

interface Setup {
  grid: MonthEntry[];
  gates: LineGates;
}

function setup(
  on: CustomerPlan = PREPAID,
  bills: MonthBill[] = [],
  skips: SkippedMonth[] = [],
  rule: "month_start" | "customer_start_day" = "month_start",
): Setup {
  const derived = buildGridsFor([on], bills, skips, 2026, rule);
  return {
    grid: derived.grids[on.id],
    gates: {
      payLimit: lastBillableMonth(customer(), on),
      uncoveredMonths: derived.uncoveredMonths[on.id],
      paidMonths: derived.paidMonths[on.id],
      usageLine: false,
    },
  };
}

const statuses = (s: Setup) => s.grid.map((e) => e.status);
const month = (s: Setup, m: number) => s.grid[m - 1];

beforeEach(() => freezeToday(2026, 6, 15));
afterEach(unfreeze);

describe("the month status", () => {
  it("TC-NS-01 a started prepaid month with no money is no_service, a later one future", () => {
    const s = setup(PREPAID, [bill("2026-03-01", 20)]);
    expect(statuses(s)).toEqual([
      "no_service", "no_service", "paid", "no_service", "no_service", "no_service",
      "future", "future", "future", "future", "future", "future",
    ]);
  });

  it("TC-NS-02 the same months on a postpaid line stay unpaid", () => {
    const s = setup(POSTPAID, [bill("2026-03-01", 20)]);
    expect(statuses(s).slice(0, 6)).toEqual(["unpaid", "unpaid", "paid", "unpaid", "unpaid", "unpaid"]);
  });

  it("TC-NS-03 part-paid stays paid with the rest owed", () => {
    const s = setup(PREPAID, [bill("2026-02-01", 5)]);
    expect(month(s, 2).status).toBe("paid");
    expect(month(s, 2).balance).toBe(15);
  });

  it("TC-NS-04 skip and write-off outrank no_service", () => {
    const s = setup(
      PREPAID,
      [bill("2026-02-01", 0, { writtenOffAt: "2026-03-01T00:00:00.000Z" })],
      [skip("2026-04-01")],
    );
    expect(month(s, 2).status).toBe("written_off");
    expect(month(s, 4).status).toBe("skipped");
  });

  it("TC-NS-05 a voided payment leaves its month no_service again", () => {
    const s = setup(PREPAID, [bill("2026-05-01", 0)]);
    expect(month(s, 5).status).toBe("no_service");
  });

  it("TC-NS-06 the org's unpaid rule has no effect on a prepaid line", () => {
    expect(statuses(setup(PREPAID, [], [], "customer_start_day"))).toEqual(statuses(setup()));
  });
});

describe("the month doors", () => {
  it("TC-NS-07 a no_service month is payable and opens collect", () => {
    const s = setup();
    expect(isPayableStatus(month(s, 2), s.gates)).toBe(true);
    expect(monthTap(month(s, 2), s.gates)).toEqual({ kind: "collect" });
  });

  it("TC-NS-08 it never blocks paying a newer month", () => {
    const s = setup();
    expect(s.gates.uncoveredMonths.filter((m) => m <= "2026-06-01")).toEqual([]);
    expect(payOrderBlocker(s.gates, ["2026-06-01"])).toBeNull();
    expect(payOrderBlocker(s.gates, ["2026-08-01"])).toBe("2026-07-01");
  });

  it("TC-NS-09 it is neither skippable nor write-off-able", () => {
    const s = setup();
    const keys = monthMenuItems(month(s, 2), s.gates, STAFF).map((i) => i.key);
    expect(keys).toContain("quick-pay");
    expect(keys).not.toContain("skip");
    expect(keys).not.toContain("write-off");
    expect(canWriteOffMonth(month(s, 2), s.gates)).toBe(false);
  });

  it("TC-NS-10 a selection of no_service months is payable, never skippable", () => {
    const s = setup();
    const groups = monthSelectionGroups([month(s, 2), month(s, 3)], s.gates);
    expect(groups.payable).toHaveLength(2);
    expect(groups.skippable).toHaveLength(0);
    expect(groups.writeOffable).toHaveLength(0);
    expect(expandSelectionUnit(month(s, 2), s.grid, PREPAID)).toEqual(["2026-02-01"]);
  });

  it("TC-NS-11 the cell reads No service in grey", () => {
    const s = setup();
    expect(cellBadge(month(s, 2))).toBe("no_service");
    expect(cellBadge(month(s, 6))).toBe("no_service");
    expect(monthCellTone(month(s, 2), true)).toBe("no_service");
  });
});

describe("customer status and counts", () => {
  it("TC-NS-12 a prepaid line with no money is never unpaid, overdue or uncovered", () => {
    const status = buildCustomerStatus([PREPAID], [], [], "month_start");
    expect(status.status).not.toBe("unpaid");
    expect(status.overdue).toBe(false);
    expect(status.unpaidMonths).toBe(0);
    expect(status.uncoveredLineIds).toEqual([]);
    expect(unpaidBillingMonths(PREPAID, [], [])).toEqual([]);
  });

  it("TC-NS-13 a paid current month still reads paid", () => {
    const status = buildCustomerStatus([PREPAID], [bill("2026-06-01", 20)], [], "month_start");
    expect(status.status).toBe("paid");
    expect(status.notDueLineIds).toEqual(["line-1"]);
  });

  it("TC-NS-14 the dashboard's this-month bar leaves a no_service month out", () => {
    const c = customer({ id: "cust-1", customerPlans: [PREPAID] });
    expect(countThisMonth([c], new Map(), [], "month_start")).toEqual({ due: 0, unpaid: 0 });
  });
});

describe("what is owed", () => {
  const owedArgs = (lines: CustomerPlan[], stored = [] as ReturnType<typeof openItem>[], bills: MonthBill[] = []) =>
    mergeOwed({
      customer: customer({ id: "cust-1", customerPlans: lines }),
      lines,
      skips: [],
      unpaidRule: "month_start",
      currencies: [],
      stored,
      billsByLine: new Map([["line-1", bills]]),
    });

  it("TC-NS-15 no_service months are never owed, postpaid ones are", () => {
    expect(owedArgs([PREPAID])).toEqual([]);
    expect(owedArgs([POSTPAID])).toHaveLength(6);
  });

  it("TC-NS-16 an empty bill left by a voided payment owes nothing on a prepaid line", () => {
    const emptied = openItem({ chargeId: "chg-may", billingMonth: "2026-05-01", dueDate: "2026-05-01" });
    expect(owedArgs([PREPAID], [emptied], [bill("2026-05-01", 0, { id: "chg-may" })])).toEqual([]);
  });

  it("TC-NS-17 the rest of a part-paid prepaid month is still owed", () => {
    const part = openItem({ chargeId: "chg-feb", billingMonth: "2026-02-01", paid: 5 });
    const owed = owedArgs([PREPAID], [part], [bill("2026-02-01", 5, { id: "chg-feb" })]);
    expect(owed.map((i) => [i.billingMonth, i.balance])).toEqual([["2026-02-01", 15]]);
  });
});
