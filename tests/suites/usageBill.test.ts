import type {
  CustomerPlan,
  LineUsage,
  MeterChange,
  PlanPriceChange,
  PlanUsage,
  StatusReading,
  UsageMonth,
} from "@shared/core/types";
import { priceHistoryOf } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import {
  isReadingLocked,
  lineUsageOf,
  usageByLineOf,
  usageMonthOf,
} from "@shared/modules/customer/customer-payments/utils/usageBill";
import {
  buildCustomerStatus,
  buildMonthGrid,
  uncoveredBillingMonths,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { isUsageNotLateYet } from "@shared/modules/customer/customer-payments/utils/monthDueRules";
import { blockingUnpaidMonths } from "@shared/modules/customer/customer-payments/utils/payOrder";
import { bill, line, plan, skip } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";

// TC-UB-* — usage (meter) bills: how a month's bill is worked out, and how the
// month grid, the customer badge and the pay order read a usage line.

const METER: PlanUsage = {
  entry: "reading",
  unitName: "kWh",
  feeName: "Fixed fee",
  highUsagePercent: null,
};

const meterPlan = plan({ id: "p-10a", price: null, currencyId: "cur-lbp", usage: METER });
const typedPlan = plan({
  id: "p-gb",
  price: null,
  currencyId: "cur-lbp",
  usage: { ...METER, entry: "direct", unitName: "GB" },
});

const meterLine = line({
  id: "line-1",
  planId: "p-10a",
  plan: meterPlan,
  startDate: "2026-06-10",
  startReading: 1000,
});

type LineReading = StatusReading & { customerPlanId: string };

function reading(
  billingMonth: string,
  value: number | null,
  over: Partial<LineReading> = {},
): LineReading {
  return {
    customerPlanId: "line-1",
    billingMonth,
    reading: value,
    units: null,
    meterChange: null,
    recordedAt: `${billingMonth.slice(0, 7)}-28T10:00:00.000Z`,
    ...over,
  };
}

let priceSeq = 0;
function price(
  month: string,
  unitPrice: number,
  fixedFee: number | null,
  createdAt = `${month.slice(0, 7)}-25T10:00:00.000Z`,
): PlanPriceChange {
  return {
    id: `price-${++priceSeq}`,
    planId: "p-10a",
    fromMonth: month,
    price: unitPrice,
    currencyId: "cur-lbp",
    durationMonths: 1,
    isCustomPrice: false,
    fixedFee,
    createdAt,
  };
}

function usageOf(
  readings: LineReading[],
  prices: PlanPriceChange[],
  ln: CustomerPlan = meterLine,
): LineUsage {
  return lineUsageOf(ln, readings, priceHistoryOf({ planChanges: prices, lineChanges: [] }))!;
}

function billOf(month: UsageMonth) {
  if (month.kind !== "bill") throw new Error(`waiting for ${month.waitingFor}`);
  return month.bill;
}

const JUNE = "2026-06-01";
const JULY = "2026-07-01";
const AUG = "2026-08-01";
const SEP = "2026-09-01";
const OCT = "2026-10-01";

beforeEach(() => freezeToday(2026, 10, 15));
afterEach(unfreeze);

describe("working out a usage bill", () => {
  it("TC-UB-01 the start month = fixed fee + (reading − start reading) × unit price", () => {
    const usage = usageOf([reading(JUNE, 1120)], [price(JUNE, 40000, 685000)]);
    expect(billOf(usageMonthOf(usage, JUNE))).toEqual({
      previousReading: 1000,
      reading: 1120,
      units: 120,
      unitPrice: 40000,
      fixedFee: 685000,
      amount: 5_485_000,
      currencyId: "cur-lbp",
      billedAt: "2026-06-28T10:00:00.000Z",
    });
  });

  it("TC-UB-02 every later month counts from the month before's reading", () => {
    const usage = usageOf(
      [reading(JUNE, 1120), reading(JULY, 1250)],
      [price(JULY, 40000, 685000)],
    );
    expect(billOf(usageMonthOf(usage, JULY))).toMatchObject({
      previousReading: 1120,
      units: 130,
      amount: 685000 + 130 * 40000,
    });
  });

  it("TC-UB-03 a typed-usage plan bills the typed units, with no readings", () => {
    const gbLine = line({ id: "line-1", planId: "p-gb", plan: typedPlan, startDate: "2026-06-01" });
    const usage = usageOf(
      [reading(JULY, null, { units: 40 })],
      [{ ...price(JULY, 1000, 50000), planId: "p-gb" }],
      gbLine,
    );
    expect(billOf(usageMonthOf(usage, JULY))).toMatchObject({
      previousReading: null,
      reading: null,
      units: 40,
      amount: 50000 + 40 * 1000,
    });
  });

  it("TC-UB-04 a replaced meter bills the old meter's tail plus the new meter's head", () => {
    const change: MeterChange = { oldMeterFinal: 1200, newMeterStart: 0, newMeterNumber: "M-2" };
    const usage = usageOf(
      [reading(JUNE, 1120), reading(JULY, 50, { meterChange: change }), reading(AUG, 90)],
      [price(JULY, 100, 0), price(AUG, 100, 0)],
    );
    expect(billOf(usageMonthOf(usage, JULY)).units).toBe(80 + 50);
    expect(billOf(usageMonthOf(usage, AUG))).toMatchObject({ previousReading: 50, units: 40 });
  });

  it("TC-UB-05 a month waits until it has its reading, the reading before it, and a price", () => {
    const priced = [price(JUNE, 100, 0), price(JULY, 100, 0)];
    expect(usageMonthOf(usageOf([], priced), JUNE)).toEqual({
      kind: "waiting",
      waitingFor: "reading",
    });
    expect(usageMonthOf(usageOf([reading(JULY, 1250)], priced), JULY)).toEqual({
      kind: "waiting",
      waitingFor: "previous_reading",
    });
    const noStart = line({ ...meterLine, startReading: null });
    expect(usageMonthOf(usageOf([reading(JUNE, 1120)], priced, noStart), JUNE)).toEqual({
      kind: "waiting",
      waitingFor: "previous_reading",
    });
    expect(usageMonthOf(usageOf([reading(JUNE, 1120)], []), JUNE)).toEqual({
      kind: "waiting",
      waitingFor: "price",
    });
  });

  it("TC-UB-06 a reading below the one before never becomes a bill", () => {
    const priced = [price(JUNE, 100, 0), price(JULY, 100, 0)];
    expect(usageMonthOf(usageOf([reading(JUNE, 990)], priced), JUNE)).toEqual({
      kind: "waiting",
      waitingFor: "reading_below_previous",
    });
    const badChange: MeterChange = { oldMeterFinal: 1100, newMeterStart: 0, newMeterNumber: null };
    const usage = usageOf(
      [reading(JUNE, 1120), reading(JULY, 50, { meterChange: badChange })],
      priced,
    );
    expect(usageMonthOf(usage, JULY)).toEqual({
      kind: "waiting",
      waitingFor: "reading_below_previous",
    });
  });

  it("TC-UB-07 a usage price prices ONLY its own month, never the months after", () => {
    const usage = usageOf(
      [reading(JUNE, 1120), reading(JULY, 1250)],
      [price(JUNE, 40000, 685000), price(JULY, 50, null)],
    );
    expect(usageMonthOf(usage, JUNE).kind).toBe("bill");
    expect(usageMonthOf(usage, JULY)).toEqual({ kind: "waiting", waitingFor: "price" });
  });

  it("TC-UB-08 a fixed price wins, but the bill's clock starts at the FIRST price save", () => {
    const usage = usageOf(
      [reading(JUNE, 1100, { recordedAt: "2026-07-02T08:00:00.000Z" })],
      [
        price(JUNE, 30000, 600000, "2026-07-10T08:00:00.000Z"),
        price(JUNE, 40000, 685000, "2026-07-15T08:00:00.000Z"),
      ],
    );
    expect(billOf(usageMonthOf(usage, JUNE))).toMatchObject({
      unitPrice: 40000,
      fixedFee: 685000,
      billedAt: "2026-07-10T08:00:00.000Z",
    });
  });

  it("TC-UB-09 a reading saved after the price starts the clock instead", () => {
    const usage = usageOf(
      [reading(JUNE, 1100, { recordedAt: "2026-07-20T08:00:00.000Z" })],
      [price(JUNE, 40000, 685000, "2026-07-10T08:00:00.000Z")],
    );
    expect(billOf(usageMonthOf(usage, JUNE)).billedAt).toBe("2026-07-20T08:00:00.000Z");
  });

  it("TC-UB-10 decimal readings and prices give a clean amount", () => {
    const usage = usageOf(
      [reading(JUNE, 1100.3)],
      [price(JUNE, 0.3, 5)],
      line({ ...meterLine, startReading: 1000.2 }),
    );
    expect(billOf(usageMonthOf(usage, JUNE))).toMatchObject({ units: 100.1, amount: 35.03 });
  });

  it("TC-UB-11 only usage lines get usage facts", () => {
    const fixed = line({ id: "line-2", plan: plan({ id: "p1", price: 20 }) });
    const byLine = usageByLineOf(
      [fixed, meterLine],
      [reading(JUNE, 1120), reading(JUNE, 5, { customerPlanId: "line-2" })],
      priceHistoryOf({ planChanges: [], lineChanges: [] }),
    );
    expect([...byLine.keys()]).toEqual(["line-1"]);
    expect([...byLine.get("line-1")!.readings.keys()]).toEqual([JUNE]);
  });
});

describe("the month grid on a usage line", () => {
  const readings = [reading(JUNE, 1120), reading(JULY, 1250), reading(SEP, 1400)];
  const prices = [price(JUNE, 40000, 685000), price(SEP, 40000, 685000)];

  it("TC-UB-20 a month is unpaid once it has a bill, and WAITING until then", () => {
    const grid = buildMonthGrid(meterLine, [], [], 2026, "month_start", usageOf(readings, prices));
    expect(grid.map((m) => m.status)).toEqual([
      "before_start",
      "before_start",
      "before_start",
      "before_start",
      "before_start",
      "unpaid",
      "waiting",
      "waiting",
      "waiting",
      "waiting",
      "future",
      "future",
    ]);
    expect(grid[6].usage).toEqual({ kind: "waiting", waitingFor: "price" });
    expect(grid[7].usage).toEqual({ kind: "waiting", waitingFor: "reading" });
    expect(grid[8].usage).toEqual({ kind: "waiting", waitingFor: "previous_reading" });
    expect(grid[5].usage?.kind).toBe("bill");
  });

  it("TC-UB-21 money and a skip still outrank waiting", () => {
    const grid = buildMonthGrid(
      meterLine,
      [bill(JULY, 1_000_000, { amount: 5_000_000 })],
      [skip(AUG)],
      2026,
      "month_start",
      usageOf(readings, prices),
    );
    expect(grid[6].status).toBe("paid");
    expect(grid[7].status).toBe("skipped");
  });

  it("TC-UB-22 the tenant's unpaid rule never applies to a usage line", () => {
    const lateStart = line({ ...meterLine, startDate: "2026-06-20" });
    const usage = usageOf(
      [reading(SEP, 1400), reading(OCT, 1500, { recordedAt: "2026-10-05T10:00:00.000Z" })],
      [price(OCT, 100, 0, "2026-10-06T10:00:00.000Z")],
      lateStart,
    );
    const grid = buildMonthGrid(lateStart, [], [], 2026, "customer_start_day", usage);
    expect(grid[9].status).toBe("unpaid");
    const fixed = line({ id: "line-9", startDate: "2026-06-20", plan: plan({ price: 20 }) });
    expect(buildMonthGrid(fixed, [], [], 2026, "customer_start_day")[9].status).toBe("future");
  });

  it("TC-UB-23 a bill staff typed is owed even with no worked-out bill; an emptied one is not", () => {
    const edited = bill(AUG, 0, {
      amount: 4_000_000,
      usage: { previousReading: 1250, reading: 1300, units: 50, unitPrice: 100, fixedFee: 0, computedAmount: 5000 },
    });
    const emptied = bill(AUG, 0, {
      amount: 5000,
      usage: { previousReading: 1250, reading: 1300, units: 50, unitPrice: 100, fixedFee: 0, computedAmount: 5000 },
    });
    const usage = usageOf(readings, prices);
    expect(buildMonthGrid(meterLine, [edited], [], 2026, "month_start", usage)[7].status).toBe("unpaid");
    expect(buildMonthGrid(meterLine, [emptied], [], 2026, "month_start", usage)[7].status).toBe("waiting");
  });

  it("TC-UB-24 a usage line read with no usage facts falls back to the fixed rules", () => {
    expect(buildMonthGrid(meterLine, [], [], 2026)[6].status).toBe("unpaid");
  });
});

describe("the customer badge on a usage line", () => {
  const julyLine = line({ ...meterLine, startDate: "2026-07-01" });
  const julyBill = () =>
    usageOf(
      [reading(JULY, 1100, { recordedAt: "2026-08-03T10:00:00.000Z" })],
      [price(JULY, 100, 0, "2026-08-20T10:00:00.000Z")],
      julyLine,
    );

  it("TC-UB-30 waiting months owe nothing", () => {
    const status = buildCustomerStatus(
      [meterLine],
      [bill(JUNE, 5_485_000, { amount: 5_485_000 })],
      [],
      "month_start",
      new Map([["line-1", usageOf([reading(JUNE, 1120)], [price(JUNE, 40000, 685000)])]]),
    );
    expect(status).toMatchObject({
      status: "not_due_yet",
      overdue: false,
      uncoveredLineIds: [],
      unpaidMonths: 0,
    });
  });

  it("TC-UB-31 an unpaid usage bill turns Overdue one month after it could first be billed", () => {
    freezeToday(2026, 9, 19);
    const before = buildCustomerStatus([julyLine], [], [], "month_start", new Map([["line-1", julyBill()]]));
    expect(before).toMatchObject({ status: "unpaid", overdue: false, uncoveredLineIds: ["line-1"] });
    freezeToday(2026, 9, 20);
    const after = buildCustomerStatus([julyLine], [], [], "month_start", new Map([["line-1", julyBill()]]));
    expect(after.overdue).toBe(true);
  });

  it("TC-UB-32 a bill billed on the 31st is late from the last day of the next month", () => {
    freezeToday(2026, 2, 27);
    expect(isUsageNotLateYet("2026-01-31T12:00:00")).toBe(true);
    freezeToday(2026, 2, 28);
    expect(isUsageNotLateYet("2026-01-31T12:00:00")).toBe(false);
  });
});

describe("pay order and reading fixes on a usage line", () => {
  it("TC-UB-40 a waiting month never blocks paying a later month", () => {
    const usage = usageOf(
      [reading(JUNE, 1120), reading(JULY, 1250)],
      [price(JULY, 40000, 685000)],
    );
    const uncovered = uncoveredBillingMonths(meterLine, [], [], "month_start", undefined, usage);
    expect(uncovered).toEqual([JULY, "2026-11-01", "2026-12-01"]);
    expect(blockingUnpaidMonths(uncovered, [JULY])).toEqual([]);
  });

  it("TC-UB-41 a meter reading is locked once money reaches its month or the next", () => {
    expect(isReadingLocked("reading", JULY, [JULY])).toBe(true);
    expect(isReadingLocked("reading", JULY, [AUG])).toBe(true);
    expect(isReadingLocked("reading", JULY, [SEP])).toBe(false);
  });

  it("TC-UB-42 typed units feed only their own month, so only that month locks them", () => {
    expect(isReadingLocked("direct", JULY, [JULY])).toBe(true);
    expect(isReadingLocked("direct", JULY, [AUG])).toBe(false);
  });
});
